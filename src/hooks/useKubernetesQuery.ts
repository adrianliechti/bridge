import { useState, useEffect, useCallback, useRef } from 'react';

interface UseKubernetesQueryOptions {
  /** Polling interval in milliseconds. Set to 0 or undefined to disable polling. */
  refetchInterval?: number;
  /** Whether to show loading state on refetch. Default: false */
  refetchShowLoading?: boolean;
}

interface UseKubernetesQueryResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
  /** Indicates if a background refetch is in progress */
  isRefetching: boolean;
}

const DEFAULT_REFETCH_INTERVAL = 5000; // 5 seconds

export function useKubernetesQuery<T>(
  fetchFn: () => Promise<T>,
  deps: unknown[] = [],
  options: UseKubernetesQueryOptions = {}
): UseKubernetesQueryResult<T> {
  const { 
    refetchInterval = DEFAULT_REFETCH_INTERVAL, 
    refetchShowLoading = false 
  } = options;
  
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isRefetching, setIsRefetching] = useState(false);
  const isFirstFetch = useRef(true);

  const fetch = useCallback(async (isBackground = false) => {
    // Only show loading spinner on initial fetch, not background refetches
    if (!isBackground || refetchShowLoading) {
      setLoading(true);
    }
    if (isBackground) {
      setIsRefetching(true);
    }
    
    try {
      const result = await fetchFn();
      setData(result);
      setError(null);
    } catch (err) {
      // Only set error on initial fetch, not background refetches
      if (!isBackground) {
        setError(err instanceof Error ? err : new Error('Unknown error'));
      }
    } finally {
      setLoading(false);
      setIsRefetching(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchFn, refetchShowLoading, ...deps]);

  // Initial fetch
  useEffect(() => {
    isFirstFetch.current = true;
    fetch(false);
  }, [fetch]);

  // Polling
  useEffect(() => {
    if (!refetchInterval || refetchInterval <= 0) return;

    const interval = setInterval(() => {
      // Only poll if we have data (initial fetch succeeded)
      if (!isFirstFetch.current || data !== null) {
        fetch(true);
      }
      isFirstFetch.current = false;
    }, refetchInterval);

    return () => clearInterval(interval);
  }, [fetch, refetchInterval, data]);

  const refetch = useCallback(() => {
    fetch(false);
  }, [fetch]);

  return { data, loading, error, refetch, isRefetching };
}
