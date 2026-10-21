import { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm, type IDisposable } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { attachTerminalClipboard } from './terminalClipboard';
import '@xterm/xterm/css/xterm.css';

export interface TerminalCallbacks {
  onData: (data: string) => void;
  onError: (error: string) => void;
  onClose: () => void;
}

interface TerminalSession {
  connect(): Promise<void>;
  send(data: string): void;
  resize(cols: number, rows: number): void;
  disconnect(): void;
  readonly isConnected: boolean;
}

interface TerminalViewProps {
  label: string;
  // Keep this callback stable so resource polling does not reconnect the terminal.
  createSession: (callbacks: TerminalCallbacks) => TerminalSession;
}

export function TerminalView({ label, createSession }: TerminalViewProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const [clipboardError, setClipboardError] = useState('');
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');

  useEffect(() => {
    if (!terminalRef.current) return;
    let cancelled = false;
    let input: IDisposable | undefined;
    const xterm = new XTerm({
      cursorBlink: true,
      fontSize: 13,
      fontFamily:
        'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
      theme: {
        background: '#0a0a0a',
        foreground: '#e5e5e5',
        cursor: '#e5e5e5',
        cursorAccent: '#0a0a0a',
        selectionBackground: '#3b82f680',
        black: '#171717',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#eab308',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#e5e5e5',
        brightBlack: '#404040',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#facc15',
        brightBlue: '#60a5fa',
        brightMagenta: '#c084fc',
        brightCyan: '#22d3ee',
        brightWhite: '#ffffff',
      },
    });
    const fitAddon = new FitAddon();
    xterm.loadAddon(fitAddon);
    xterm.loadAddon(new WebLinksAddon());
    xterm.open(terminalRef.current);
    const clipboard = attachTerminalClipboard(xterm, setClipboardError);
    fitAddon.fit();
    xterm.writeln(`Connecting to ${label}...\r\n`);

    const session = createSession({
      onData: (data) => {
        if (!cancelled) xterm.write(data);
      },
      onError: (error) => {
        if (!cancelled) xterm.writeln(`\r\n\x1b[31mError: ${error}\x1b[0m`);
      },
      onClose: () => {
        if (cancelled) return;
        input?.dispose();
        clipboard.cancelPendingPaste();
        setStatus('disconnected');
        xterm.writeln('\r\n\x1b[33mConnection closed.\x1b[0m');
      },
    });

    const resize = () => {
      fitAddon.fit();
      if (session.isConnected) session.resize(xterm.cols, xterm.rows);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(terminalRef.current);

    const connect = async () => {
      setStatus('connecting');
      setClipboardError('');
      try {
        await session.connect();
        if (cancelled) return;
        setStatus('connected');
        resize();
        xterm.focus();
        input = xterm.onData((data) => session.send(data));
      } catch (error) {
        if (cancelled) return;
        setStatus('disconnected');
        const message = error instanceof Error ? error.message : 'Failed to connect';
        xterm.writeln(`\r\n\x1b[31mFailed to connect: ${message}\x1b[0m`);
      }
    };
    void connect();

    return () => {
      cancelled = true;
      observer.disconnect();
      input?.dispose();
      session.disconnect();
      clipboard.dispose();
      xterm.dispose();
    };
  }, [createSession, label]);

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#0a0a0a]">
      <div ref={terminalRef} className="flex-1 min-h-0 p-2" />
      {clipboardError && (
        <div role="status" className="px-4 py-1 text-xs text-amber-400">
          {clipboardError}
        </div>
      )}
      <div className="shrink-0 px-4 py-1.5 border-t border-neutral-800 bg-neutral-900/50 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
        <span className="flex items-center gap-1.5">
          <span
            className={`w-1.5 h-1.5 rounded-full ${status === 'connected' ? 'bg-emerald-500' : status === 'connecting' ? 'bg-amber-500 animate-pulse' : 'bg-neutral-600'}`}
          />
          {status === 'connected'
            ? 'Connected'
            : status === 'connecting'
              ? 'Connecting...'
              : 'Disconnected'}
        </span>
        <span className="text-neutral-600 truncate min-w-0" title={label}>
          {label}
        </span>
        {status === 'disconnected' && <span>Reopen the Terminal tab to connect again.</span>}
      </div>
    </div>
  );
}
