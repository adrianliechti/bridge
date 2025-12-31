import { useState, useRef, useCallback, useEffect } from 'react';
import { ChevronDown, Copy, Check, Filter } from 'lucide-react';
import { streamCombinedLogs, getWorkloadPods, type LogEntry } from '../../api/kubernetes/kubernetesLogs';
import { useCluster } from '../../hooks/useCluster';
import type { KubernetesResource } from '../../api/kubernetes/kubernetes';
import { ToolbarPortal } from '../ToolbarPortal';

export interface LogViewerProps {
  resource: KubernetesResource;
  toolbarRef?: React.RefObject<HTMLDivElement | null>;
}

// Color palette for different pods
const POD_COLORS = [
  'text-cyan-400',
  'text-emerald-400',
  'text-amber-400',
  'text-purple-400',
  'text-pink-400',
  'text-blue-400',
  'text-red-400',
  'text-orange-400',
];

function getPodColor(podName: string, podNames: string[]): string {
  const index = podNames.indexOf(podName);
  return POD_COLORS[index % POD_COLORS.length];
}

function formatTimestamp(timestamp?: string): string {
  if (!timestamp) return '';
  try {
    const date = new Date(timestamp);
    // Format: HH:MM:SS.mmm
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

type LogFormat = 'json' | 'klog' | 'logfmt' | 'plain';

interface ParsedLog {
  format: LogFormat;
  formatted: string;
  jsonData?: Record<string, unknown>;
  level?: LogLevel;
}

// Parse klog format: I1224 22:55:14.528759  1 file.go:123] "message" key=value
const KLOG_REGEX = /^([IWEF])(\d{4})\s+(\d{2}:\d{2}:\d{2}\.\d+)\s+\d+\s+([\w.]+:\d+)]\s*(.*)$/;

function parseKlog(message: string): ParsedLog | null {
  const match = message.match(KLOG_REGEX);
  if (!match) return null;
  
  const [, levelChar, , , source, rest] = match;
  const level: LogLevel = 
    levelChar === 'E' ? 'error' : 
    levelChar === 'W' ? 'warn' : 
    levelChar === 'F' ? 'error' : 'info';
  
  // Parse the rest which may have "message" and key=value pairs
  const kvPairs = parseKeyValuePairs(rest);
  
  // Format nicely
  const lines = [`source: ${source}`];
  for (const [key, value] of Object.entries(kvPairs)) {
    lines.push(`${key}: ${value}`);
  }
  
  return {
    format: 'klog',
    formatted: lines.join('\n'),
    level,
  };
}

// Parse key=value pairs (logfmt style)
function parseKeyValuePairs(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  
  // Match: key=value, key="value with spaces", or "quoted message"
  const regex = /(?:"([^"]*)"|([\w.]+)=(?:"([^"]*)"|([^\s]*)))/g;
  let match;
  let msgIndex = 0;
  
  while ((match = regex.exec(text)) !== null) {
    if (match[1] !== undefined) {
      // Standalone quoted string - treat as message
      result[`msg${msgIndex || ''}`] = match[1];
      msgIndex++;
    } else {
      const key = match[2];
      const value = match[3] ?? match[4] ?? '';
      result[key] = value;
    }
  }
  
  return result;
}

// Check if text looks like logfmt (key=value pairs)
function parseLogfmt(message: string): ParsedLog | null {
  const trimmed = message.trim();
  
  // Must have at least one key=value pattern
  if (!/\w+=/.test(trimmed)) return null;
  
  const kvPairs = parseKeyValuePairs(trimmed);
  const keys = Object.keys(kvPairs);
  
  // Need at least 2 key-value pairs to consider it logfmt
  if (keys.length < 2) return null;
  
  // Detect level from common fields
  let level: LogLevel = 'unknown';
  const levelValue = (kvPairs.level ?? kvPairs.lvl ?? kvPairs.severity ?? '').toLowerCase();
  if (levelValue.includes('err') || levelValue === 'fatal') level = 'error';
  else if (levelValue.includes('warn')) level = 'warn';
  else if (levelValue === 'info') level = 'info';
  else if (levelValue === 'debug') level = 'debug';
  
  // Format nicely
  const lines = keys.map(key => `${key}: ${kvPairs[key]}`);
  
  return {
    format: 'logfmt',
    formatted: lines.join('\n'),
    level,
  };
}

// Try to parse and pretty-print log messages in various formats
function parseLogMessage(message: string): ParsedLog {
  const trimmed = message.trim();
  
  // Try JSON first
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      return { 
        format: 'json', 
        formatted: JSON.stringify(parsed, null, 2), 
        jsonData: parsed 
      };
    } catch {
      // Not valid JSON, continue
    }
  }
  
  // Try klog format
  const klogResult = parseKlog(trimmed);
  if (klogResult) return klogResult;
  
  // Try logfmt format
  const logfmtResult = parseLogfmt(trimmed);
  if (logfmtResult) return logfmtResult;
  
  // Plain text
  return { format: 'plain', formatted: message };
}

type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'unknown';

const LOG_LEVEL_COLORS: Record<LogLevel, string> = {
  error: 'text-red-600 dark:text-red-400',
  warn: 'text-yellow-600 dark:text-yellow-400',
  info: 'text-blue-600 dark:text-blue-400',
  debug: 'text-neutral-600 dark:text-neutral-400',
  trace: 'text-neutral-500 dark:text-neutral-500',
  unknown: 'text-neutral-700 dark:text-neutral-300',
};

const LOG_LEVEL_BG: Record<LogLevel, string> = {
  error: 'bg-red-50 dark:bg-red-500/10 border-l-2 border-red-400 dark:border-red-500/50',
  warn: 'bg-yellow-50 dark:bg-yellow-500/10 border-l-2 border-yellow-400 dark:border-yellow-500/50',
  info: '',
  debug: '',
  trace: '',
  unknown: '',
};

// Detect log level from message content or JSON structure
function detectLogLevel(message: string, jsonData?: Record<string, unknown>, preDetected?: LogLevel): LogLevel {
  // Use pre-detected level if available and not unknown
  if (preDetected && preDetected !== 'unknown') return preDetected;
  
  // Check JSON fields first (common structured logging formats)
  if (jsonData) {
    const level = (jsonData.level ?? jsonData.severity ?? jsonData.lvl ?? jsonData.log_level ?? '') as string;
    const levelLower = String(level).toLowerCase();
    if (levelLower.includes('err') || levelLower === 'fatal' || levelLower === 'critical') return 'error';
    if (levelLower.includes('warn')) return 'warn';
    if (levelLower === 'info') return 'info';
    if (levelLower === 'debug') return 'debug';
    if (levelLower === 'trace') return 'trace';
  }
  
  // Fall back to text pattern matching
  const lower = message.toLowerCase();
  const start = lower.slice(0, 100); // Check first 100 chars for performance
  
  // Error patterns
  if (/\b(error|err|fatal|critical|panic|exception)\b/.test(start)) return 'error';
  // Warning patterns
  if (/\b(warn|warning)\b/.test(start)) return 'warn';
  // Info patterns
  if (/\binfo\b/.test(start)) return 'info';
  // Debug patterns
  if (/\bdebug\b/.test(start)) return 'debug';
  // Trace patterns
  if (/\btrace\b/.test(start)) return 'trace';
  
  return 'unknown';
}

// Custom hook for fetching pods from a resource
// For Pods, returns the pod name directly; for workloads, fetches associated pods
function useResourcePods(context: string, resource: KubernetesResource) {
  const [state, setState] = useState<{
    podNames: string[];
    loading: boolean;
    error: string | null;
  }>({ podNames: [], loading: false, error: null });

  const kind = resource.kind;
  const name = resource.metadata?.name;
  const namespace = resource.metadata?.namespace;

  useEffect(() => {
    if (!kind || !name || !namespace) {
      return;
    }

    // For Pods, return the name directly without fetching
    if (kind === 'Pod') {
      setState({ podNames: [name], loading: false, error: null });
      return;
    }

    let cancelled = false;

    async function fetchPods() {
      try {
        const pods = await getWorkloadPods(context, namespace!, kind!, name!);
        if (!cancelled) {
          setState({ podNames: pods, loading: false, error: null });
        }
      } catch (err) {
        if (!cancelled) {
          setState(s => ({ ...s, loading: false, error: (err as Error).message }));
        }
      }
    }

    setState(s => ({ ...s, loading: true, error: null }));
    fetchPods();

    return () => {
      cancelled = true;
    };
  }, [context, namespace, kind, name]);

  return state;
}

const TAIL_LINES = 4000;

export function LogViewer({ 
  resource,
  toolbarRef,
}: LogViewerProps) {
  const { context } = useCluster();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [hasStarted, setHasStarted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showOnlyIssues, setShowOnlyIssues] = useState(false);
  
  const logsEndRef = useRef<HTMLDivElement>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);

  const handleCopyLogs = async () => {
    const text = logs.map(log => `${log.timestamp} [${log.podName}] ${log.message}`).join('\n');
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const abortControllerRef = useRef<AbortController | null>(null);

  const namespace = resource.metadata?.namespace;
  const { podNames, loading: isLoading, error: fetchError } = useResourcePods(context, resource);

  // Detect manual scroll to disable auto-scroll
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

  // Auto-start streaming when pods become available
  const shouldAutoStart = podNames.length > 0 && !hasStarted && !isLoading;
  useEffect(() => {
    if (shouldAutoStart) {
      const timer = setTimeout(() => {
        if (podNames.length > 0 && namespace) {
          setStreamError(null);
          setHasStarted(true);
          
          abortControllerRef.current = streamCombinedLogs({
            context,
            namespace,
            podNames,
            follow: true,
            tailLines: TAIL_LINES,
            timestamps: true,
            onLog: (log) => {
              setLogs(prev => [...prev, log]);
            },
            onError: (err) => {
              setStreamError(err.message);
            },
          });
        }
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [shouldAutoStart, context, namespace, podNames]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    };
  }, []);

  // Scroll to bottom
  const scrollToBottom = useCallback(() => {
    setAutoScroll(true);
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const error = fetchError || streamError;

  return (
    <div className="flex flex-col h-full bg-neutral-50 dark:bg-neutral-950">
      {/* Toolbar actions rendered via portal to parent */}
      {toolbarRef && (
        <ToolbarPortal toolbarRef={toolbarRef}>
          <button
            onClick={() => setShowOnlyIssues(!showOnlyIssues)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded transition-colors ${
              showOnlyIssues
                ? 'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-500/20'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-800'
            }`}
            title={showOnlyIssues ? 'Show all logs' : 'Show only errors & warnings'}
          >
            <Filter size={12} />
          </button>
          <button
            onClick={handleCopyLogs}
            disabled={logs.length === 0}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Copy logs"
          >
            {copied ? (
              <Check size={12} className="text-emerald-500" />
            ) : (
              <Copy size={12} />
            )}
          </button>
        </ToolbarPortal>
      )}

      {/* Logs content */}
      <div 
        ref={logsContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto font-mono text-xs"
      >
        {isLoading && (
          <div className="p-4 text-neutral-500 dark:text-neutral-500">Loading pods...</div>
        )}
        
        {error && (
          <div className="p-4 text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-500/10 border-b border-red-300 dark:border-red-500/30">
            {error}
          </div>
        )}

        {!isLoading && podNames.length === 0 && (
          <div className="p-4 text-neutral-500 dark:text-neutral-500">No pods found</div>
        )}

        {logs.length === 0 && !isLoading && podNames.length > 0 && !error && (
          <div className="p-4 text-neutral-500 dark:text-neutral-500">Waiting for logs...</div>
        )}

        <div className="p-2 space-y-1">
          {logs.map((log, index) => {
            const parsed = parseLogMessage(log.message);
            const level = detectLogLevel(log.message, parsed.jsonData, parsed.level);
            
            // Filter out non-issue logs if filter is enabled
            if (showOnlyIssues && level !== 'error' && level !== 'warn') {
              return null;
            }
            
            const textColor = LOG_LEVEL_COLORS[level];
            const bgStyle = LOG_LEVEL_BG[level];
            const isStructured = parsed.format !== 'plain';
            
            return (
              <div key={index} className={`hover:bg-neutral-100 dark:hover:bg-neutral-900/50 rounded px-2 py-1 group ${bgStyle}`}>
                {/* Metadata line */}
                <div className="flex items-center gap-2 text-[10px] leading-tight mb-0.5">
                  <span className="text-neutral-500 dark:text-neutral-600">
                    {formatTimestamp(log.timestamp)}
                  </span>
                  <span 
                    className={`${getPodColor(log.podName, podNames)}`}
                    title={log.podName}
                  >
                    {log.podName}
                  </span>
                  {log.container && log.container !== log.podName && (
                    <span className="text-neutral-500 dark:text-neutral-500">
                      {log.container}
                    </span>
                  )}
                </div>
                {/* Log message */}
                {isStructured ? (
                  <pre className={`${textColor} whitespace-pre overflow-x-auto scrollbar-hide leading-snug text-[11px]`}>
                    {parsed.formatted}
                  </pre>
                ) : (
                  <div className={`${textColor} break-all whitespace-pre-wrap leading-snug`}>
                    {parsed.formatted}
                  </div>
                )}
              </div>
            );
          })}
          <div ref={logsEndRef} />
        </div>
      </div>

      {/* Scroll to bottom button (only shown when not at bottom) */}
      {!autoScroll && (
        <div className="shrink-0 px-4 py-2 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-900/50">
          <button
            onClick={scrollToBottom}
            className="flex items-center gap-1 text-xs text-neutral-600 dark:text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-300"
          >
            <ChevronDown size={12} />
            Scroll to bottom
          </button>
        </div>
      )}
    </div>
  );
}