import { describe, expect, it } from "vitest";

import {
  buildWorkerSpawnLifecycleOptions,
  resolveWorkerKillPid,
  shouldUseDetachedWorkerGroup,
  signalWorkerProcessTreeSync,
} from "./worker-process-lifecycle";

describe("worker process lifecycle", () => {
  it("starts local worker wrappers in their own process group on POSIX", () => {
    expect(shouldUseDetachedWorkerGroup("linux")).toBe(true);
    expect(buildWorkerSpawnLifecycleOptions("linux")).toEqual({ detached: true });
  });

  it("targets the whole POSIX process group during cleanup", () => {
    expect(resolveWorkerKillPid(1234, "linux")).toBe(-1234);
  });

  it("falls back to direct process termination on Windows", () => {
    expect(shouldUseDetachedWorkerGroup("win32")).toBe(false);
    expect(buildWorkerSpawnLifecycleOptions("win32")).toEqual({ detached: false });
    expect(resolveWorkerKillPid(1234, "win32")).toBe(1234);
  });

  it("synchronously targets the active process group as an exit-hook fallback", () => {
    const originalKill = process.kill;
    const calls: Array<[number, NodeJS.Signals | undefined]> = [];
    process.kill = ((pid: number, signal?: NodeJS.Signals) => {
      calls.push([pid, signal]);
      return true;
    }) as typeof process.kill;

    try {
      signalWorkerProcessTreeSync({ pid: 4321, exitCode: null, signalCode: null } as never);
    } finally {
      process.kill = originalKill;
    }

    expect(calls).toEqual([[-4321, "SIGTERM"]]);
  });
});
