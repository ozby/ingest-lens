const REPLAY_RETENTION_MS = 60 * 60 * 1000;
const REPLAY_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS msg_log (
    replay_cursor INTEGER PRIMARY KEY AUTOINCREMENT,
    seq TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )
`;

type ReplayRow = {
  replayCursor: number;
  payload: string;
};

export class TopicRoom {
  constructor(private ctx: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/ws") {
      const cursor = this.parseCursor(url.searchParams.get("cursor"));
      if (cursor === null && url.searchParams.has("cursor")) {
        return new Response(
          JSON.stringify({ status: "error", message: "cursor must be a decimal string" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
      this.ctx.acceptWebSocket(server);
      if (cursor !== null) {
        for (const replay of this.loadReplayRows(cursor)) {
          server.send(this.serializeReplayPayload(replay.payload, String(replay.replayCursor)));
        }
      }
      return new Response(null, { status: 101, webSocket: client });
    }

    if (request.method === "POST" && url.pathname === "/notify") {
      const payload = await request.json<Record<string, unknown>>();
      const seq = this.parseSeq(payload.seq);
      if (seq === null) {
        return new Response(
          JSON.stringify({ status: "error", message: "seq must be a decimal string" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const now = Date.now();
      const payloadJson = JSON.stringify(payload);
      const replayCursor = this.persistReplayRow(seq, payloadJson, now);
      const replayPayload = this.serializeReplayPayload(payloadJson, replayCursor);

      const sockets = this.ctx.getWebSockets();
      for (const ws of sockets) {
        ws.send(replayPayload);
      }
      return new Response(null, { status: 200 });
    }

    return new Response("Not found", { status: 404 });
  }

  webSocketMessage(_ws: WebSocket, _message: string | ArrayBuffer): void {
    // no-op for now — could handle ping→pong here
  }

  webSocketClose(_ws: WebSocket, _code: number, _reason: string, _wasClean: boolean): void {
    // hibernation handles cleanup
  }

  webSocketError(_ws: WebSocket, _error: unknown): void {
    // hibernation handles cleanup
  }

  private ensureReplayTable(): void {
    this.ctx.storage.sql.exec(REPLAY_TABLE_SQL);
  }

  private persistReplayRow(seq: string, payloadJson: string, createdAt: number): string {
    this.ensureReplayTable();
    this.ctx.storage.sql.exec(
      `
        INSERT INTO msg_log (seq, payload, created_at)
        VALUES (?, ?, ?)
      `,
      seq,
      payloadJson,
      createdAt,
    );
    const { replayCursor } = this.ctx.storage.sql
      .exec<{ replayCursor: number }>("SELECT last_insert_rowid() AS replayCursor")
      .one();
    this.ctx.storage.sql.exec(
      "DELETE FROM msg_log WHERE created_at < ?",
      createdAt - REPLAY_RETENTION_MS,
    );
    return String(replayCursor);
  }

  private loadReplayRows(cursor: string): ReplayRow[] {
    this.ensureReplayTable();
    return this.ctx.storage.sql
      .exec<ReplayRow>(
        `
          SELECT replay_cursor AS replayCursor, payload
          FROM msg_log
          WHERE replay_cursor > CAST(? AS INTEGER)
          ORDER BY replay_cursor ASC
        `,
        cursor,
      )
      .toArray();
  }

  private serializeReplayPayload(payloadJson: string, replayCursor: string): string {
    const payload = JSON.parse(payloadJson) as Record<string, unknown>;
    return JSON.stringify({ ...payload, cursor: replayCursor });
  }

  private parseCursor(cursor: string | null): string | null {
    if (cursor === null) {
      return null;
    }
    return typeof cursor === "string" && /^[0-9]+$/.test(cursor) ? cursor : null;
  }

  private parseSeq(value: unknown): string | null {
    return typeof value === "string" && /^[0-9]+$/.test(value) ? value : null;
  }
}
