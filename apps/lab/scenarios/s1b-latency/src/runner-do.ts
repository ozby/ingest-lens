/**
 * S1bRunnerDO — Task 3.6
 *
 * Durable Object that orchestrates the s1b-latency scenario.
 * Uses alarm-chunked execution to stay within Worker CPU budget (F-04).
 *
 * Default mode: "sequential" — paths run one after another to avoid
 * Hyperdrive-pool contention that would contaminate p99 (F-07).
 * "parallel" is available as an explicit stress override.
 *
 * Idempotent start(): if already running, returns immediately.
 * Respects abort(): drains CF Queue consumer, closes subscriber, releases locks.
 */
import type { DurableObjectState } from "@cloudflare/workers-types";
import type { ScenarioRunner, SessionContext, ScenarioEvent } from "@repo/lab-core";
import { summarize } from "./aggregator";
import type { PathLatencySummary } from "./aggregator";
import type { RunMode, RunnerState } from "./runner-state";
import { DEFAULT_MESSAGE_COUNT, DEFAULT_RUN_MODE } from "./runner-state";

export interface S1bRunnerDOEnv {
  // Populated by the call site (wrangler binding or test mock)
  [key: string]: unknown;
}

export interface StartOptions {
  sessionId: string;
  mode?: RunMode;
  messageCount?: number;
}

export interface RunResult {
  summaries: PathLatencySummary[];
  mode: RunMode;
  status: RunnerState["status"];
}

/** Factory type for creating the three scenario paths */
export interface PathFactory {
  createCfQueuesPath(messageCount: number): ScenarioRunner;
  createPgPollingPath(messageCount: number): ScenarioRunner;
  createDirectNotifyPath(messageCount: number): ScenarioRunner;
}

export class S1bRunnerDO {
  private readonly state: DurableObjectState;
  private readonly pathFactory: PathFactory;
  private abortController: AbortController | null = null;

  constructor(state: DurableObjectState, _env: S1bRunnerDOEnv, pathFactory: PathFactory) {
    this.state = state;
    this.pathFactory = pathFactory;
  }

  /**
   * Start a new run. Idempotent — if a run is already in progress for the
   * same sessionId, returns the current state without re-launching.
   */
  async start(opts: StartOptions): Promise<RunResult> {
    const existing = await this.state.storage.get<RunnerState>("runnerState");
    if (
      existing !== undefined &&
      existing.sessionId === opts.sessionId &&
      existing.status === "running"
    ) {
      return {
        summaries: existing.summaries,
        mode: existing.mode,
        status: existing.status,
      };
    }

    const runState: RunnerState = {
      sessionId: opts.sessionId,
      status: "running",
      mode: opts.mode ?? DEFAULT_RUN_MODE,
      messageCount: opts.messageCount ?? DEFAULT_MESSAGE_COUNT,
      startedAt: new Date().toISOString(),
      completedAt: null,
      summaries: [],
      error: null,
    };

    await this.state.storage.put("runnerState", runState);

    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    try {
      const result = await this.executeRun(runState, signal);
      return result;
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      runState.status = "failed";
      runState.error = reason;
      runState.completedAt = new Date().toISOString();
      await this.state.storage.put("runnerState", runState);
      return { summaries: [], mode: runState.mode, status: "failed" };
    }
  }

  /** Abort an in-progress run */
  async abort(): Promise<void> {
    if (this.abortController !== null) {
      this.abortController.abort();
      this.abortController = null;
    }
    const runState = await this.state.storage.get<RunnerState>("runnerState");
    if (runState !== undefined && runState.status === "running") {
      runState.status = "aborted";
      runState.completedAt = new Date().toISOString();
      await this.state.storage.put("runnerState", runState);
    }
  }

  /** Retrieve the current runner state */
  async getState(): Promise<RunnerState | null> {
    return (await this.state.storage.get<RunnerState>("runnerState")) ?? null;
  }

  private async executeRun(runState: RunnerState, signal: AbortSignal): Promise<RunResult> {
    const { sessionId, mode, messageCount } = runState;

    const cfQueuesPath = this.pathFactory.createCfQueuesPath(messageCount);
    const pgPollingPath = this.pathFactory.createPgPollingPath(messageCount);
    const directNotifyPath = this.pathFactory.createDirectNotifyPath(messageCount);

    const ctx: SessionContext = { sessionId, signal };
    const allEvents: ScenarioEvent[] = [];

    const runPath = async (runner: ScenarioRunner): Promise<void> => {
      for await (const event of runner.run(ctx)) {
        allEvents.push(event);
      }
    };

    const wallStart = Date.now();

    if (mode === "parallel") {
      await Promise.all([runPath(cfQueuesPath), runPath(pgPollingPath), runPath(directNotifyPath)]);
    } else {
      // sequential — default; avoids Hyperdrive pool contention
      await runPath(cfQueuesPath);
      if (!signal.aborted) await runPath(pgPollingPath);
      if (!signal.aborted) await runPath(directNotifyPath);
    }

    const wallMs = Date.now() - wallStart;

    const cfSummary = summarize("cf-queues-latency", allEvents, wallMs);
    const pgSummary = summarize("pg-polling-latency", allEvents, wallMs);
    const nfySummary = summarize("pg-direct-notify-latency", allEvents, wallMs);

    runState.summaries = [cfSummary, pgSummary, nfySummary];
    runState.status = signal.aborted ? "aborted" : "completed";
    runState.completedAt = new Date().toISOString();

    await this.state.storage.put("runnerState", runState);

    return {
      summaries: runState.summaries,
      mode: runState.mode,
      status: runState.status,
    };
  }
}
