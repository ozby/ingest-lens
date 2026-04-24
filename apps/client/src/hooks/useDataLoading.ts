import { useCallback, useEffect, useRef, useState } from "react";

export interface UseDataLoadingResult<T> {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
  reload: () => void;
}

/**
 * Fetch-on-mount helper with race-safe abort semantics.
 *
 * - Aborts the prior request whenever `deps` change.
 * - Aborts any in-flight request on unmount and never writes state afterward.
 * - `reload()` re-triggers the loader manually.
 *
 * The loader receives an `AbortSignal`; propagate it to `fetch` (or rely on
 * the hook to discard the stale result either way — late resolutions are
 * ignored).
 */
export function useDataLoading<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
): UseDataLoadingResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [reloadToken, setReloadToken] = useState<number>(0);

  const loaderRef = useRef(loader);
  useEffect(() => {
    loaderRef.current = loader;
  }, [loader]);

  const isMountedRef = useRef<boolean>(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const reload = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    setIsLoading(true);
    setError(null);

    loaderRef
      .current(controller.signal)
      .then((result) => {
        if (cancelled || controller.signal.aborted || !isMountedRef.current) {
          return;
        }
        setData(result);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled || controller.signal.aborted || !isMountedRef.current) {
          return;
        }
        const normalized = err instanceof Error ? err : new Error(String(err));
        setError(normalized);
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadToken]);

  return { data, isLoading, error, reload };
}
