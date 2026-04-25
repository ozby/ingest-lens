/**
 * RunnerState — DO storage schema for S1aRunnerDO.
 *
 * All state is serialized to DO storage so the runner survives
 * restarts and can resume from the last saved cursor.
 */

export type PathMode = "sequential" | "parallel";
export type RunPhase = "idle" | "running" | "completed" | "aborted";
export type PathPhase = "pending" | "running" | "completed" | "failed";

export interface PathState {
  pathId: string;
  phase: PathPhase;
  batchCursor: number; // next batch index to send (0-based)
  deliveredCount: number;
  inversionCount: number;
  startedAt?: string;
  completedAt?: string;
  failureReason?: string;
}

export interface RunnerState {
  sessionId: string;
  workloadSize: number;
  seed: string;
  mode: PathMode;
  phase: RunPhase;
  activePathIndex: number; // sequential: index into pathOrder
  pathOrder: string[]; // ["cf-queues", "pg-polling", "pg-direct-notify"]
  paths: Record<string, PathState>;
  startedAt: string;
  completedAt?: string;
}

export const PATH_ORDER: string[] = ["cf-queues", "pg-polling", "pg-direct-notify"];

export function makeInitialState(
  sessionId: string,
  workloadSize: number,
  seed: string,
  mode: PathMode,
): RunnerState {
  const paths: Record<string, PathState> = {};
  for (const pathId of PATH_ORDER) {
    paths[pathId] = {
      pathId,
      phase: "pending",
      batchCursor: 0,
      deliveredCount: 0,
      inversionCount: 0,
    };
  }
  return {
    sessionId,
    workloadSize,
    seed,
    mode,
    phase: "idle",
    activePathIndex: 0,
    pathOrder: [...PATH_ORDER],
    paths,
    startedAt: new Date("2026-01-01").toISOString(),
  };
}
