import { useState, useEffect } from 'react';
import { streamContainerLogs, type DockerContainer, formatContainerName } from '../api/docker/docker';
import type { LogEntry } from '../components/sections/LogViewer';

export interface UseDockerLogsOptions {
  context: string;
  container: DockerContainer;
  tailLines?: number;
}

export interface UseDockerLogsResult {
  logs: LogEntry[];
  sources: string[];
  isLoading: boolean;
  error: string | null;
  isAvailable: boolean;
  unavailableMessage?: string;
}

const DEFAULT_TAIL_LINES = 1000;

// Parse Docker log line with optional timestamp
function parseLine(line: string): { timestamp?: string; message: string } {
  // Docker timestamps are RFC3339Nano format at the start: 2024-12-31T10:30:00.123456789Z
  // Clean line of carriage returns that can interfere with regex matching
  const cleanLine = line.replace(/\r/g, '');
  
  // Match timestamp followed by optional whitespace
  const timestampMatch = cleanLine.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\s*(.*)$/);
  
  if (timestampMatch) {
    const [, timestamp, message] = timestampMatch;
    return { timestamp, message };
  }
  
  return { message: cleanLine };
}

export function useDockerLogs({
  context,
  container,
  tailLines = DEFAULT_TAIL_LINES,
}: UseDockerLogsOptions): UseDockerLogsResult {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const containerId = container.Id;
  const containerName = formatContainerName(container.Names ?? []);
  const isRunning = container.State === 'running';

  // Stream logs when container is running
  useEffect(() => {
    if (!isRunning || !containerId) {
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    // Each (re)subscription requests the last `tailLines` again — start from a
    // clean slate or the fresh tail would be appended onto the old history
    // (e.g. after a context/tailLines change or a stop→start of the same
    // container, where only this effect re-runs, not the component).
    queueMicrotask(() => {
      if (!cancelled) {
        setLogs([]);
        setError(null);
      }
    });

    streamContainerLogs(
      context,
      containerId,
      {
        follow: true,
        stdout: true,
        stderr: true,
        timestamps: true,
        tail: tailLines,
      },
      (line) => {
        if (cancelled) return;
        const parsed = parseLine(line);
        setLogs(prev => [...prev, {
          timestamp: parsed.timestamp,
          message: parsed.message,
          source: containerName,
        }]);
      },
      controller.signal
    ).catch((err) => {
      if (cancelled) return;
      if (err.name !== 'AbortError') {
        setError(err.message);
      }
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [context, containerId, containerName, isRunning, tailLines]);

  // Determine availability
  const isAvailable = isRunning;
  const unavailableMessage = !isRunning 
    ? 'Container is not running. Start the container to view logs.'
    : undefined;

  return {
    logs,
    sources: isAvailable ? [containerName] : [],
    isLoading: false,
    error,
    isAvailable,
    unavailableMessage,
  };
}
