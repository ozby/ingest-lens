import type { ChildProcess } from "node:child_process";

const WORKER_EXIT_TIMEOUT_MS = 5_000;

export function shouldUseDetachedWorkerGroup(
  platform: NodeJS.Platform = process.platform,
): boolean {
  return platform !== "win32";
}

export function buildWorkerSpawnLifecycleOptions(platform: NodeJS.Platform = process.platform): {
  detached: boolean;
} {
  return { detached: shouldUseDetachedWorkerGroup(platform) };
}

export function resolveWorkerKillPid(
  pid: number,
  platform: NodeJS.Platform = process.platform,
): number {
  return shouldUseDetachedWorkerGroup(platform) ? -pid : pid;
}

function waitForWorkerExit(processRef: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (processRef.exitCode !== null || processRef.signalCode !== null) return Promise.resolve(true);

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve(false);
    }, timeoutMs);
    const onExit = () => {
      cleanup();
      resolve(true);
    };
    const cleanup = () => {
      clearTimeout(timeout);
      processRef.off("exit", onExit);
    };

    processRef.once("exit", onExit);
  });
}

export function signalWorkerProcessTreeSync(
  processRef: ChildProcess,
  signal: NodeJS.Signals = "SIGTERM",
): void {
  if (processRef.exitCode !== null || processRef.signalCode !== null) return;

  const pid = processRef.pid;
  if (pid) {
    try {
      process.kill(resolveWorkerKillPid(pid), signal);
      return;
    } catch {}
  }

  try {
    processRef.kill(signal);
  } catch {}
}

export async function terminateWorkerProcessTree(
  processRef: ChildProcess,
  options: { signal?: NodeJS.Signals; forceSignal?: NodeJS.Signals; timeoutMs?: number } = {},
): Promise<void> {
  if (processRef.exitCode !== null || processRef.signalCode !== null) return;

  const signal = options.signal ?? "SIGTERM";
  const forceSignal = options.forceSignal ?? "SIGKILL";
  const timeoutMs = options.timeoutMs ?? WORKER_EXIT_TIMEOUT_MS;

  signalWorkerProcessTreeSync(processRef, signal);

  const exited = await waitForWorkerExit(processRef, timeoutMs);
  if (exited) return;

  signalWorkerProcessTreeSync(processRef, forceSignal);
}
