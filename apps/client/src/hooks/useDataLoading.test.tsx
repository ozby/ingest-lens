import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useDataLoading } from "./useDataLoading";

describe("useDataLoading", () => {
  it("populates data and clears loading on resolve", async () => {
    const loader = vi.fn(async () => "payload");

    const { result } = renderHook(({ deps }) => useDataLoading(loader, deps), {
      initialProps: { deps: ["a"] as readonly unknown[] },
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBe(null);
    expect(result.current.error).toBe(null);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toBe("payload");
    expect(result.current.error).toBe(null);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("populates error and clears loading on reject", async () => {
    const failure = new Error("boom");
    const loader = vi.fn(async () => {
      throw failure;
    });

    const { result } = renderHook(() => useDataLoading(loader, ["a"]));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toBe(null);
    expect(result.current.error).toBe(failure);
  });

  it("discards a stale in-flight result when deps change", async () => {
    type Deferred = {
      promise: Promise<string>;
      resolve: (value: string) => void;
    };
    const makeDeferred = (): Deferred => {
      let resolve!: (value: string) => void;
      const promise = new Promise<string>((res) => {
        resolve = res;
      });
      return { promise, resolve };
    };

    const first = makeDeferred();
    const second = makeDeferred();
    const signals: AbortSignal[] = [];
    const loader = vi
      .fn<(signal: AbortSignal) => Promise<string>>()
      .mockImplementationOnce((signal) => {
        signals.push(signal);
        return first.promise;
      })
      .mockImplementationOnce((signal) => {
        signals.push(signal);
        return second.promise;
      });

    const { result, rerender } = renderHook(({ deps }) => useDataLoading(loader, deps), {
      initialProps: { deps: ["first"] as readonly unknown[] },
    });

    expect(result.current.isLoading).toBe(true);

    rerender({ deps: ["second"] as readonly unknown[] });

    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);

    await act(async () => {
      first.resolve("stale");
      await first.promise;
    });

    expect(result.current.data).toBe(null);
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      second.resolve("fresh");
      await second.promise;
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toBe("fresh");
    expect(result.current.error).toBe(null);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("does not update state after unmount", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    let resolve!: (value: string) => void;
    const pending = new Promise<string>((res) => {
      resolve = res;
    });
    let capturedSignal: AbortSignal | null = null;
    const loader = vi.fn(async (signal: AbortSignal) => {
      capturedSignal = signal;
      return pending;
    });

    const { result, unmount } = renderHook(() => useDataLoading(loader, ["x"]));

    expect(result.current.isLoading).toBe(true);

    unmount();

    expect(capturedSignal).not.toBe(null);
    expect((capturedSignal as unknown as AbortSignal).aborted).toBe(true);

    await act(async () => {
      resolve("late");
      await pending;
    });

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("reload retriggers the loader without changing deps", async () => {
    let callCount = 0;
    const loader = vi.fn(async () => {
      callCount += 1;
      return `call-${callCount}`;
    });

    const { result } = renderHook(() => useDataLoading(loader, ["stable"]));

    await waitFor(() => {
      expect(result.current.data).toBe("call-1");
    });

    act(() => {
      result.current.reload();
    });

    await waitFor(() => {
      expect(result.current.data).toBe("call-2");
    });

    expect(loader).toHaveBeenCalledTimes(2);
  });
});
