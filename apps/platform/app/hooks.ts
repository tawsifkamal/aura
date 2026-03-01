import { useEffect, useState } from "react";

/**
 * Simple data-fetching hook. Returns `undefined` while loading,
 * then the resolved value. Re-fetches when `deps` change.
 */
export function useApi<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = [],
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
