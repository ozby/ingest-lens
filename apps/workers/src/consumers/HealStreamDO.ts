import type { MappingSuggestion, MappingSuggestionBatch } from "@repo/types";

type ApprovedState = {
  fingerprint: string;
  suggestions: MappingSuggestion[];
  approvedAt: string;
};

type HealStreamState = {
  approved: ApprovedState | null;
};

type TryHealBody = {
  batch: MappingSuggestionBatch;
  sourceSystem: string;
  fingerprint: string;
};

export class HealStreamDO {
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/state") {
      return this.handleGetState();
    }

    if (request.method === "POST" && url.pathname === "/tryHeal") {
      return this.handleTryHeal(request);
    }

    if (request.method === "POST" && url.pathname === "/rollback") {
      return this.handleRollback();
    }

    return new Response("Not found", { status: 404 });
  }

  private async handleGetState(): Promise<Response> {
    const approved = (await this.state.storage.get<ApprovedState>("approved")) ?? null;
    const responseBody: HealStreamState = { approved };
    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  private async handleTryHeal(request: Request): Promise<Response> {
    const body = await request.json<TryHealBody>();
    const { batch, fingerprint } = body;

    if (!batch || !fingerprint) {
      return new Response(
        JSON.stringify({ healed: false, error: "Missing batch or fingerprint" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const newState: ApprovedState = {
      fingerprint,
      suggestions: batch.suggestions as MappingSuggestion[],
      approvedAt: new Date().toISOString(),
    };

    await this.state.storage.put("approved", newState);

    return new Response(JSON.stringify({ healed: true, suggestions: newState.suggestions }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  private async handleRollback(): Promise<Response> {
    await this.state.storage.delete("approved");
    return new Response(JSON.stringify({ rolledBack: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  getState(): Promise<HealStreamState> {
    return this.handleGetState().then((r) => r.json<HealStreamState>());
  }

  async tryHeal(body: TryHealBody): Promise<{ healed: boolean; suggestions: MappingSuggestion[] }> {
    const res = await this.handleTryHeal(
      new Request("https://do/tryHeal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
    return res.json<{ healed: boolean; suggestions: MappingSuggestion[] }>();
  }

  async rollback(): Promise<{ rolledBack: boolean }> {
    const res = await this.handleRollback();
    return res.json<{ rolledBack: boolean }>();
  }
}
