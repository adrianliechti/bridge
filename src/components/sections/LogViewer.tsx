import { useState, useRef, useCallback, useEffect } from 'react';
import { ChevronDown, Copy, Check, Filter } from 'lucide-react';
import { ToolbarPortal } from '../ToolbarPortal';
import Anser from 'anser';

// Shared log entry type for all platforms
export interface LogEntry {
  timestamp?: string;
  message: string;
  source: string; // Primary source identifier (pod name, container name)
  container?: string; // Secondary identifier (container within pod)
}

export interface LogViewerProps {
  logs: LogEntry[];
  sources: string[]; // List of unique sources for color coding
  isLoading?: boolean;
  error?: string | null;
  emptyMessage?: string;
  unavailableMessage?: string;
  toolbarRef?: React.RefObject<HTMLDivElement | null>;
}

// Color palette for different sources
const SOURCE_COLORS = [
  'text-cyan-400',
  'text-emerald-400',
  'text-amber-400',
  'text-purple-400',
  'text-pink-400',
  'text-blue-400',
  'text-red-400',
  'text-orange-400',
];

function getSourceColor(source: string, sources: string[]): string {
  const index = sources.indexOf(source);
  return SOURCE_COLORS[index % SOURCE_COLORS.length];
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

type LogFormat = 'json' | 'klog' | 'logfmt' | 'plain';
type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'unknown';

interface ParsedLog {
  format: LogFormat;
  formatted: string;
  jsonData?: Record<string, unknown>;
  level?: LogLevel;
}

// Strip ANSI escape codes for format detection
function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
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
  
  const kvPairs = parseKeyValuePairs(rest);
  
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
  
  const regex = /(?:"([^"]*)"|([\w.]+)=(?:"([^"]*)"|([^\s]*)))/g;
  let match;
  let msgIndex = 0;
  
  while ((match = regex.exec(text)) !== null) {
    if (match[1] !== undefined) {
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
  
  if (!/\w+=/.test(trimmed)) return null;
  
  const kvPairs = parseKeyValuePairs(trimmed);
  const keys = Object.keys(kvPairs);
  
  if (keys.length < 2) return null;
  
  let level: LogLevel = 'unknown';
  const levelValue = (kvPairs.level ?? kvPairs.lvl ?? kvPairs.severity ?? '').toLowerCase();
  if (levelValue.includes('err') || levelValue === 'fatal') level = 'error';
  else if (levelValue.includes('warn')) level = 'warn';
  else if (levelValue === 'info') level = 'info';
  else if (levelValue === 'debug') level = 'debug';
  
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
  // Strip ANSI for format detection, but keep original for plain text display
  const stripped = stripAnsi(trimmed);
  
  // Try JSON first
  if (stripped.startsWith('{') || stripped.startsWith('[')) {
    try {
      const parsed = JSON.parse(stripped);
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
  const klogResult = parseKlog(stripped);
  if (klogResult) return klogResult;
  
  // Try logfmt format
  const logfmtResult = parseLogfmt(stripped);
  if (logfmtResult) return logfmtResult;
  
  // Plain text - keep original with ANSI codes for rendering
  return { format: 'plain', formatted: message };
}

const LOG_LEVEL_COLORS: Record<LogLevel, string> = {
  error: 'text-red-600 dark:text-red-400',
  warn: 'text-yellow-600 dark:text-yellow-400',
  info: 'text-blue-600 dark:text-blue-400',
  debug: 'text-neutral-600 dark:text-neutral-400',
  trace: 'text-neutral-500 dark:text-neutral-500',
  unknown: 'text-neutral-700 dark:text-neutral-300',
};

// Theme-aware ANSI foreground color mapping
const ANSI_FG_COLORS: Record<string, string> = {
  'ansi-black': 'text-neutral-800 dark:text-neutral-400',
  'ansi-red': 'text-red-600 dark:text-red-400',
  'ansi-green': 'text-green-600 dark:text-green-400',
  'ansi-yellow': 'text-yellow-600 dark:text-yellow-300',
  'ansi-blue': 'text-blue-600 dark:text-blue-400',
  'ansi-magenta': 'text-fuchsia-600 dark:text-fuchsia-400',
  'ansi-cyan': 'text-cyan-600 dark:text-cyan-400',
  'ansi-white': 'text-neutral-600 dark:text-neutral-200',
  'ansi-bright-black': 'text-neutral-500 dark:text-neutral-500',
  'ansi-bright-red': 'text-red-500 dark:text-red-300',
  'ansi-bright-green': 'text-green-500 dark:text-green-300',
  'ansi-bright-yellow': 'text-yellow-500 dark:text-yellow-200',
  'ansi-bright-blue': 'text-blue-500 dark:text-blue-300',
  'ansi-bright-magenta': 'text-fuchsia-500 dark:text-fuchsia-300',
  'ansi-bright-cyan': 'text-cyan-500 dark:text-cyan-300',
  'ansi-bright-white': 'text-neutral-400 dark:text-white',
};

// Theme-aware ANSI background color mapping
const ANSI_BG_COLORS: Record<string, string> = {
  'ansi-black': 'bg-neutral-900 dark:bg-neutral-900',
  'ansi-red': 'bg-red-600/20 dark:bg-red-500/30',
  'ansi-green': 'bg-green-600/20 dark:bg-green-500/30',
  'ansi-yellow': 'bg-yellow-500/20 dark:bg-yellow-500/30',
  'ansi-blue': 'bg-blue-600/20 dark:bg-blue-500/30',
  'ansi-magenta': 'bg-fuchsia-600/20 dark:bg-fuchsia-500/30',
  'ansi-cyan': 'bg-cyan-600/20 dark:bg-cyan-500/30',
  'ansi-white': 'bg-neutral-200 dark:bg-neutral-100',
  'ansi-bright-black': 'bg-neutral-700 dark:bg-neutral-700',
  'ansi-bright-red': 'bg-red-500/30 dark:bg-red-400/40',
  'ansi-bright-green': 'bg-green-500/30 dark:bg-green-400/40',
  'ansi-bright-yellow': 'bg-yellow-400/30 dark:bg-yellow-400/40',
  'ansi-bright-blue': 'bg-blue-500/30 dark:bg-blue-400/40',
  'ansi-bright-magenta': 'bg-fuchsia-500/30 dark:bg-fuchsia-400/40',
  'ansi-bright-cyan': 'bg-cyan-500/30 dark:bg-cyan-400/40',
  'ansi-bright-white': 'bg-white dark:bg-white',
};

// Render ANSI escape codes as colored spans with theme-aware colors
function AnsiText({ text }: { text: string }) {
  const parsed = Anser.ansiToJson(text, { use_classes: true, remove_empty: true });
  
  if (parsed.length === 0) {
    return <>{text}</>;
  }
  
  // Check if there are any actual ANSI codes (non-default styling)
  const hasAnsiCodes = parsed.some(p => p.fg || p.bg || p.decorations?.length);
  if (!hasAnsiCodes) {
    return <>{text}</>;
  }
  
  return (
    <>
      {parsed.map((part, i) => {
        const classes: string[] = [];
        
        // Map foreground color
        if (part.fg && ANSI_FG_COLORS[part.fg]) {
          classes.push(ANSI_FG_COLORS[part.fg]);
        }
        
        // Map background color
        if (part.bg && ANSI_BG_COLORS[part.bg]) {
          classes.push(ANSI_BG_COLORS[part.bg]);
        }
        
        // Handle decorations
        if (part.decorations?.includes('bold')) classes.push('font-bold');
        if (part.decorations?.includes('italic')) classes.push('italic');
        if (part.decorations?.includes('underline')) classes.push('underline');
        
        return classes.length > 0 ? (
          <span key={i} className={classes.join(' ')}>{part.content}</span>
        ) : (
          <span key={i}>{part.content}</span>
        );
      })}
    </>
  );
}

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
  if (preDetected && preDetected !== 'unknown') return preDetected;
  
  if (jsonData) {
    const level = (jsonData.level ?? jsonData.severity ?? jsonData.lvl ?? jsonData.log_level ?? '') as string;
    const levelLower = String(level).toLowerCase();
    if (levelLower.includes('err') || levelLower === 'fatal' || levelLower === 'critical') return 'error';
    if (levelLower.includes('warn')) return 'warn';
    if (levelLower === 'info') return 'info';
    if (levelLower === 'debug') return 'debug';
    if (levelLower === 'trace') return 'trace';
  }
  
  const lower = message.toLowerCase();
  const start = lower.slice(0, 100);
  
  if (/\b(error|err|fatal|critical|panic|exception)\b/.test(start)) return 'error';
  if (/\b(warn|warning)\b/.test(start)) return 'warn';
  if (/\binfo\b/.test(start)) return 'info';
  if (/\bdebug\b/.test(start)) return 'debug';
  if (/\btrace\b/.test(start)) return 'trace';
  
  return 'unknown';
}

export function LogViewer({ 
  logs,
  sources,
  isLoading = false,
  error,
  emptyMessage = 'Waiting for logs...',
  unavailableMessage,
  toolbarRef,
}: LogViewerProps) {
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);
  const [showOnlyIssues, setShowOnlyIssues] = useState(false);
  
  const logsEndRef = useRef<HTMLDivElement>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);

  const handleCopyLogs = async () => {
    const text = logs.map(log => 
      `${log.timestamp ?? ''} [${log.source}]${log.container ? ` [${log.container}]` : ''} ${log.message}`
    ).join('\n');
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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

  // Scroll to bottom
  const scrollToBottom = useCallback(() => {
    setAutoScroll(true);
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Show unavailable message if provided
  if (unavailableMessage) {
    return (
      <div className="h-full flex items-center justify-center text-neutral-500 dark:text-neutral-500">
        {unavailableMessage}
      </div>
    );
  }

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
          <div className="p-4 text-neutral-500 dark:text-neutral-500">Loading...</div>
        )}
        
        {error && (
          <div className="p-4 text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-500/10 border-b border-red-300 dark:border-red-500/30">
            {error}
          </div>
        )}

        {!isLoading && sources.length === 0 && !unavailableMessage && (
          <div className="p-4 text-neutral-500 dark:text-neutral-500">No sources found</div>
        )}

        {logs.length === 0 && !isLoading && sources.length > 0 && !error && (
          <div className="p-4 text-neutral-500 dark:text-neutral-500">{emptyMessage}</div>
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
                  <span 
                    className={`${getSourceColor(log.source, sources)}`}
                    title={log.source}
                  >
                    {log.source}
                  </span>
                  <span className="text-neutral-500 dark:text-neutral-600">
                    {formatTimestamp(log.timestamp)}
                  </span>
                  {log.container && log.container !== log.source && (
                    <span className="text-neutral-500 dark:text-neutral-500">
                      {log.container}
                    </span>
                  )}
                </div>
                {/* Log message */}
                {isStructured ? (
                  <pre className={`${textColor} whitespace-pre overflow-x-auto scrollbar-hide leading-snug text-[11px]`}>
                    <AnsiText text={parsed.formatted} />
                  </pre>
                ) : (
                  <div className={`${textColor} break-all whitespace-pre-wrap leading-snug`}>
                    <AnsiText text={parsed.formatted} />
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
