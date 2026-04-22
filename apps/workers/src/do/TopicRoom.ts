export class TopicRoom {
  constructor(private ctx: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/ws") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
      this.ctx.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    if (request.method === "POST" && url.pathname === "/notify") {
      const payload = await request.json<Record<string, unknown>>();
      const sockets = this.ctx.getWebSockets();
      for (const ws of sockets) {
        ws.send(JSON.stringify(payload));
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
}
