import { useState, useEffect, useMemo } from 'react';
import {
  streamCombinedLogs,
  getWorkloadPods,
  getPodContainers,
  type LogEntry as KubeLogEntry,
} from '../api/kubernetes/kubernetesLogs';
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
  // The resource identity (`context/namespace/kind/name`) that `fetchedPods`
  // and `podContainers` were last resolved for. The streaming effect uses
  // this to refuse to stream until the resolver has caught up with a fresh
  // resource — otherwise a workload→Pod switch could open streams against
  // stale container names from the previous resource for one render.
  const [resolvedFor, setResolvedFor] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const kind = resource.kind;
  const name = resource.metadata?.name;
  const namespace = resource.metadata?.namespace;
  const identity = `${context}/${namespace ?? ''}/${kind ?? ''}/${name ?? ''}`;

  const sources = useMemo(() => {
    if (kind === 'Pod' && name) return [name];
    return fetchedPods;
  }, [kind, name, fetchedPods]);

  // Resolver: produce the pod/container set for the current resource.
  useEffect(() => {
    if (!kind || !name || !namespace) return;

    let cancelled = false;

    const resolve = async () => {
      setIsLoading(true);
      setError(null);
      try {
        if (kind === 'Pod') {
          const containers = await getPodContainers(context, namespace, name);
          if (cancelled) return;
          setPodContainers(containers);
          setResolvedFor(identity);
        } else {
          const pods = await getWorkloadPods(context, namespace, kind, name);
          if (cancelled) return;
          setFetchedPods(pods);
          setPodContainers([]);
          setResolvedFor(identity);
        }
      } catch (err) {
        if (cancelled) return;
        setError((err as Error).message);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    resolve();

    return () => {
      cancelled = true;
    };
  }, [context, namespace, kind, name, identity]);

  // Streaming effect. Refuses to run until the resolver has produced state
  // for *this* identity; otherwise sources/podContainers may still describe
  // the previous resource.
  useEffect(() => {
    if (resolvedFor !== identity) return;
    if (!namespace || sources.length === 0) return;
    if (kind === 'Pod' && podContainers.length === 0) return;

    let cancelled = false;
    const controllers: AbortController[] = [];
    const isPodWithMultipleContainers = kind === 'Pod' && podContainers.length > 1;

    // Reset the log buffer for the new source set. setLogs is wrapped in a
    // microtask so the effect body itself stays setState-free (per the
    // react-hooks/set-state-in-effect rule); the closure check inside still
    // honours `cancelled` if the effect tears down before the microtask runs.
    queueMicrotask(() => {
      if (cancelled) return;
      setLogs([]);
    });

    if (isPodWithMultipleContainers) {
      const perContainerTail = Math.ceil(tailLines / podContainers.length);
      for (const container of podContainers) {
        controllers.push(
          streamCombinedLogs({
            context,
            namespace,
            podNames: sources,
            container,
            follow: true,
            tailLines: perContainerTail,
            timestamps: true,
            onLog: (log: KubeLogEntry) => {
              if (cancelled) return;
              setLogs((prev) => [
                ...prev,
                {
                  timestamp: log.timestamp,
                  message: log.message,
                  source: log.podName,
                  container,
                },
              ]);
            },
            onError: (err) => {
              if (cancelled) return;
              setError(err.message);
            },
          }),
        );
      }
    } else {
      controllers.push(
        streamCombinedLogs({
          context,
          namespace,
          podNames: sources,
          container: podContainers.length === 1 ? podContainers[0] : undefined,
          follow: true,
          tailLines,
          timestamps: true,
          onLog: (log: KubeLogEntry) => {
            if (cancelled) return;
            setLogs((prev) => [
              ...prev,
              {
                timestamp: log.timestamp,
                message: log.message,
                source: log.podName,
                container: log.container,
              },
            ]);
          },
          onError: (err) => {
            if (cancelled) return;
            setError(err.message);
          },
        }),
      );
    }

    return () => {
      cancelled = true;
      for (const c of controllers) c.abort();
    };
  }, [resolvedFor, identity, context, namespace, kind, sources, podContainers, tailLines]);

  return { logs, sources, isLoading, error };
}
