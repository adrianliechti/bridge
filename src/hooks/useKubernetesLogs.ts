import { useState, useEffect, useRef, useMemo } from 'react';
import { streamCombinedLogs, getWorkloadPods, getPodContainers, type LogEntry as KubeLogEntry } from '../api/kubernetes/kubernetesLogs';
import type { LogEntry } from '../components/sections/LogViewer';
import type { KubernetesResource } from '../api/kubernetes/kubernetes';

export interface UseKubernetesLogsOptions {
  context: string;
  resource: KubernetesResource;
  tailLines?: number;
}

export interface UseKubernetesLogsResult {
  logs: LogEntry[];
  sources: string[];
  isLoading: boolean;
  error: string | null;
}

const DEFAULT_TAIL_LINES = 4000;

export function useKubernetesLogs({
  context,
  resource,
  tailLines = DEFAULT_TAIL_LINES,
}: UseKubernetesLogsOptions): UseKubernetesLogsResult {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [fetchedPods, setFetchedPods] = useState<string[]>([]);
  const [podContainers, setPodContainers] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasStarted, setHasStarted] = useState(false);
  
  const abortControllerRef = useRef<AbortController | null>(null);

  const kind = resource.kind;
  const name = resource.metadata?.name;
  const namespace = resource.metadata?.namespace;

  // For Pods, use name directly; otherwise use fetched pods
  const sources = useMemo(() => {
    if (kind === 'Pod' && name) {
      return [name];
    }
    return fetchedPods;
  }, [kind, name, fetchedPods]);

  // Fetch pods for workload resources (not Pods)
  useEffect(() => {
    if (!kind || !name || !namespace || kind === 'Pod') {
      return;
    }

    let cancelled = false;

    async function fetchPods() {
      setIsLoading(true);
      try {
        const pods = await getWorkloadPods(context, namespace!, kind!, name!);
        if (!cancelled) {
          setFetchedPods(pods);
          setIsLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message);
          setIsLoading(false);
        }
      }
    }

    fetchPods();

    return () => {
      cancelled = true;
    };
  }, [context, namespace, kind, name]);

  // Fetch containers for Pod resources
  useEffect(() => {
    if (!kind || !name || !namespace || kind !== 'Pod') {
      return;
    }

    let cancelled = false;

    async function fetchContainers() {
      setIsLoading(true);
      try {
        const containers = await getPodContainers(context, namespace!, name!);
        if (!cancelled) {
          setPodContainers(containers);
          setIsLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message);
          setIsLoading(false);
        }
      }
    }

    fetchContainers();

    return () => {
      cancelled = true;
    };
  }, [context, namespace, kind, name]);

  // Start streaming logs when sources are available
  // For pods with multiple containers, we need to wait for container list to be ready
  const isPodWithMultipleContainers = kind === 'Pod' && podContainers.length > 1;
  const shouldAutoStart = sources.length > 0 && !hasStarted && !isLoading && 
    (kind !== 'Pod' || podContainers.length > 0);
  
  useEffect(() => {
    if (shouldAutoStart && namespace) {
      const timer = setTimeout(() => {
        setHasStarted(true);
        
        // For pods with multiple containers, start separate streams for each container
        if (isPodWithMultipleContainers) {
          const controllers: AbortController[] = [];
          for (const container of podContainers) {
            const controller = streamCombinedLogs({
              context,
              namespace,
              podNames: sources,
              container,
              follow: true,
              tailLines: Math.ceil(tailLines / podContainers.length), // Split tail lines across containers
              timestamps: true,
              onLog: (log: KubeLogEntry) => {
                const entry: LogEntry = {
                  timestamp: log.timestamp,
                  message: log.message,
                  source: log.podName,
                  container: container,
                };
                setLogs(prev => [...prev, entry]);
              },
              onError: (err) => {
                setError(err.message);
              },
            });
            controllers.push(controller);
          }
          // Create a combined abort controller
          abortControllerRef.current = {
            abort: () => controllers.forEach(c => c.abort()),
            signal: controllers[0]?.signal,
          } as AbortController;
        } else {
          // Single container or workload - use original logic
          abortControllerRef.current = streamCombinedLogs({
            context,
            namespace,
            podNames: sources,
            container: podContainers.length === 1 ? podContainers[0] : undefined,
            follow: true,
            tailLines,
            timestamps: true,
            onLog: (log: KubeLogEntry) => {
              const entry: LogEntry = {
                timestamp: log.timestamp,
                message: log.message,
                source: log.podName,
                container: log.container,
              };
              setLogs(prev => [...prev, entry]);
            },
            onError: (err) => {
              setError(err.message);
            },
          });
        }
      }, 0);
      
      return () => clearTimeout(timer);
    }
  }, [shouldAutoStart, context, namespace, sources, tailLines, isPodWithMultipleContainers, podContainers, kind]);

  // Cleanup on unmount or when resource identity changes
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    };
  }, [kind, name, namespace]);

  return {
    logs,
    sources,
    isLoading,
    error,
  };
}

