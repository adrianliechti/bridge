import { useQuery, type UseQueryOptions } from '@tanstack/react-query';

interface UseKubernetesQueryOptions {
  /** Polling interval in milliseconds. Set to 0 or undefined to disable polling. */
  refetchInterval?: number;
  /** Whether the query is enabled. Default: true */
  enabled?: boolean;
}

const DEFAULT_REFETCH_INTERVAL = 5000; // 5 seconds

export function useKubernetesQuery<T>(
  queryKey: unknown[],
  fetchFn: () => Promise<T>,
  options: UseKubernetesQueryOptions = {}
) {
  const { 
    refetchInterval = DEFAULT_REFETCH_INTERVAL,
    enabled = true,
  } = options;

  const queryOptions: UseQueryOptions<T, Error> = {
    queryKey,
    queryFn: fetchFn,
    refetchInterval: refetchInterval > 0 ? refetchInterval : false,
    enabled,
  };

  const query = useQuery(queryOptions);

  return {
    data: query.data ?? null,
    loading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    isRefetching: query.isFetching && !query.isLoading,
  };
}
