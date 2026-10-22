import { useQuery } from '@tanstack/react-query';
import { getConfig, loadConfig, type AppConfig } from '../config';

// /config.json only lists Docker contexts whose daemon is running. Refresh it
// so a context shows up or disappears (e.g. Docker Desktop started or quit)
// without a reload.
export function useAppConfig(): AppConfig {
  const { data } = useQuery({
    queryKey: ['config'],
    queryFn: loadConfig,
    initialData: getConfig,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
  return data;
}
