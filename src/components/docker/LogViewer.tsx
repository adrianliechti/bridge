import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronDown, Copy, Check, X, ScrollText, Maximize2, Minimize2 } from 'lucide-react';
import { streamContainerLogs, type DockerContainer, formatContainerName } from '../../api/docker/docker';

interface LogViewerProps {
  container: DockerContainer;
}

type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'unknown';

interface LogLine {
  timestamp?: string;
  message: string;
  level: LogLevel;
}

const LOG_LEVEL_COLORS: Record<LogLevel, string> = {
  error: 'text-red-600 dark:text-red-400',
  warn: 'text-yellow-600 dark:text-yellow-400',
  info: 'text-blue-600 dark:text-blue-400',
  debug: 'text-neutral-600 dark:text-neutral-400',
  unknown: 'text-neutral-700 dark:text-neutral-300',
};

const LOG_LEVEL_BG: Record<LogLevel, string> = {
  error: 'bg-red-50 dark:bg-red-500/10 border-l-2 border-red-400 dark:border-red-500/50',
  warn: 'bg-yellow-50 dark:bg-yellow-500/10 border-l-2 border-yellow-400 dark:border-yellow-500/50',
  info: '',
  debug: '',
  unknown: '',
};

function detectLogLevel(message: string): LogLevel {
  const lower = message.toLowerCase();
  const start = lower.slice(0, 100);
  
  if (/\b(error|err|fatal|critical|panic|exception)\b/.test(start)) return 'error';
  if (/\b(warn|warning)\b/.test(start)) return 'warn';
  if (/\binfo\b/.test(start)) return 'info';
  if (/\bdebug\b/.test(start)) return 'debug';
  
  return 'unknown';
}

function parseLine(line: string): LogLine {
  // Docker timestamps are RFC3339Nano format at the start: 2024-12-31T10:30:00.123456789Z
  const timestampMatch = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)\s+(.*)$/);
  
  if (timestampMatch) {
    const [, timestamp, message] = timestampMatch;
    return {
      timestamp,
      message,
      level: detectLogLevel(message),
    };
  }
  
  return {
    message: line,
    level: detectLogLevel(line),
  };
}

function formatTimestamp(timestamp?: string): string {
  if (!timestamp) return '';
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    });
  } catch {
    return timestamp;
  }
}

const TAIL_LINES = 1000;

// Inner component that handles log streaming - use key={container.Id} to reset state
function LogViewerInner({ container }: LogViewerProps) {
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  
  const logsEndRef = useRef<HTMLDivElement>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const containerName = formatContainerName(container.Names ?? []);

  // Handle scroll to detect manual scrolling
  const handleScroll = useCallback(() => {
    if (!logsContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = logsContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setAutoScroll(isAtBottom);
  }, []);

  // Auto-scroll effect
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  // Start streaming logs
  useEffect(() => {
    const containerId = container.Id;
    
    // Only stream if container is running and has an ID
    if (container.State !== 'running' || !containerId) {
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    streamContainerLogs(
      containerId,
      {
        follow: true,
        stdout: true,
        stderr: true,
        timestamps: true,
        tail: TAIL_LINES,
      },
      (line) => {
        const parsed = parseLine(line);
        setLogs(prev => [...prev, parsed]);
      },
      controller.signal
    ).catch((err) => {
      if (err.name !== 'AbortError') {
        setStreamError(err.message);
      }
    });

    return () => {
      controller.abort();
    };
  }, [container.Id, container.State]);

  const handleCopyLogs = async () => {
    const text = logs.map(log => 
      log.timestamp 
        ? `${log.timestamp} ${log.message}`
        : log.message
    ).join('\n');
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const scrollToBottom = () => {
    setAutoScroll(true);
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Not running state
  if (container.State !== 'running') {
    return (
      <div className="h-full flex items-center justify-center text-neutral-500">
        <ScrollText size={18} className="mr-2" />
        Container is not running. Start the container to view logs.
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${isExpanded ? 'fixed inset-0 z-50 bg-neutral-950' : 'h-full'}`}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">{containerName}</span>
          <span className="text-neutral-500">•</span>
          <span className="text-neutral-500">{logs.length} lines</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyLogs}
            className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            title="Copy logs"
          >
            {copied ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
          </button>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            title={isExpanded ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          {isExpanded && (
            <button
              onClick={() => setIsExpanded(false)}
              className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              title="Close"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Error display */}
      {streamError && (
        <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
          Error: {streamError}
        </div>
      )}

      {/* Log content */}
      <div
        ref={logsContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto font-mono text-xs bg-neutral-950 text-neutral-200"
      >
        {logs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-neutral-500">
            Waiting for logs...
          </div>
        ) : (
          <div className="p-2">
            {logs.map((log, index) => (
              <div
                key={index}
                className={`flex gap-2 py-0.5 px-2 -mx-2 ${LOG_LEVEL_BG[log.level]}`}
              >
                {log.timestamp && (
                  <span className="text-neutral-500 shrink-0 w-24">
                    {formatTimestamp(log.timestamp)}
                  </span>
                )}
                <span className={LOG_LEVEL_COLORS[log.level]}>{log.message}</span>
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        )}
      </div>

      {/* Auto-scroll indicator */}
      {!autoScroll && logs.length > 0 && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-4 right-4 flex items-center gap-1 px-3 py-1.5 bg-neutral-800 text-neutral-200 rounded-full shadow-lg hover:bg-neutral-700 transition-colors"
        >
          <ChevronDown size={14} />
          <span className="text-xs">Scroll to bottom</span>
        </button>
      )}
    </div>
  );
}

// Wrapper component that uses key to reset inner state when container changes
export function LogViewer({ container }: LogViewerProps) {
  return <LogViewerInner key={container.Id} container={container} />;
}
