/**
 * Runner state types for S1bRunnerDO — Task 3.6
 */

export type RunMode = "sequential" | "parallel";

export type RunnerStatus = "idle" | "running" | "completed" | "aborted" | "failed";

export interface RunnerState {
  sessionId: string;
  status: RunnerStatus;
  mode: RunMode;
  messageCount: number;
  startedAt: string | null; // ISO8601
  completedAt: string | null;
  summaries: import("./aggregator").PathLatencySummary[];
  error: string | null;
}

export const DEFAULT_MESSAGE_COUNT = 1000;
export const DEFAULT_RUN_MODE: RunMode = "sequential";
