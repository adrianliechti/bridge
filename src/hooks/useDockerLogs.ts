import { useState, useEffect } from 'react';
import { createLogBuffer } from './logBuffer.ts';
import {
  streamContainerLogs,
  type DockerContainer,
  formatContainerName,
} from '../api/docker/docker';
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
  droppedLines: number;
  retry: () => void;
}

const DEFAULT_TAIL_LINES = 1000;

// Parse Docker log line with optional timestamp
function parseLine(line: string): { timestamp?: string; message: string } {
  // Docker timestamps are RFC3339Nano format at the start: 2024-12-31T10:30:00.123456789Z
  // Clean line of carriage returns that can interfere with regex matching
  const cleanLine = line.replace(/\r/g, '');

  // Match timestamp followed by optional whitespace
  const timestampMatch = cleanLine.match(
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\s*(.*)$/,
  );

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
  const [isLoading, setIsLoading] = useState(true);
  const [droppedLines, setDroppedLines] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const containerId = container.Id;
  const containerName = formatContainerName(container.Names ?? []);
  const isRunning = container.State === 'running';

  // Stopped containers retain logs; only a running container needs follow mode.
  useEffect(() => {
    if (!containerId) {
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const buffer = createLogBuffer<LogEntry>((snapshot) => {
      if (cancelled) return;
      setLogs(snapshot.entries);
      setDroppedLines(snapshot.dropped);
    });

    // Each (re)subscription requests the last `tailLines` again — start from a
    // clean slate or the fresh tail would be appended onto the old history
    // (e.g. after a context/tailLines change or a stop→start of the same
    // container, where only this effect re-runs, not the component).
    queueMicrotask(() => {
      if (!cancelled) {
        setLogs([]);
        setDroppedLines(0);
        setIsLoading(true);
        setError(null);
      }
    });

    streamContainerLogs(
      context,
      containerId,
      {
        follow: isRunning,
        stdout: true,
        stderr: true,
        timestamps: true,
        tail: tailLines,
      },
      (line) => {
        if (cancelled) return;
        const parsed = parseLine(line);
        buffer.push({
          timestamp: parsed.timestamp,
          message: parsed.message,
          source: containerName,
        });
      },
      controller.signal,
      () => {
        if (!cancelled) setIsLoading(false);
      },
    )
      .catch((err) => {
        if (cancelled) return;
        if (err.name !== 'AbortError') {
          setError(err.message);
        }
      })
      .finally(() => {
        buffer.flush();
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
      buffer.dispose();
      controller.abort();
    };
  }, [context, containerId, containerName, isRunning, tailLines, attempt]);

  // Determine availability
  const isAvailable = !!containerId;
  const unavailableMessage = !containerId ? 'Container ID is not available.' : undefined;

  return {
    logs,
    sources: isAvailable ? [containerName] : [],
    isLoading,
    droppedLines,
    retry: () => setAttempt((value) => value + 1),
    error,
    isAvailable,
    unavailableMessage,
  };
}
