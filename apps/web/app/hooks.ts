"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Simple data-fetching hook that replaces Convex's useQuery.
 * Returns `undefined` while loading, then the resolved value.
 */
export function useApi<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = []
): T | undefined {
  const [data, setData] = useState<T | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setData(undefined);
    fetcher().then((result) => {
      if (!cancelled) setData(result);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return data;
}

/**
 * Simple mutation hook that replaces Convex's useMutation.
 * Returns an async function you can call with args.
 */
export function useMutationApi<TArgs extends unknown[], TResult>(
  mutator: (...args: TArgs) => Promise<TResult>
): (...args: TArgs) => Promise<TResult> {
  return useCallback(mutator, [mutator]);
}
