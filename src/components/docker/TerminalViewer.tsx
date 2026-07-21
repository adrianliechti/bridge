import { useState, useRef, useEffect } from 'react';
import { Terminal as XTerm, type IDisposable } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { ShellSession } from '../../api/docker/dockerExec';
import { formatContainerName, type DockerContainer } from '../../api/docker/docker';
import '@xterm/xterm/css/xterm.css';

export interface DockerTerminalViewerProps {
  context: string;
  container: DockerContainer;
}

function TerminalViewerInner({ context, container }: DockerTerminalViewerProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const sessionRef = useRef<ShellSession | null>(null);
  const inputDisposableRef = useRef<IDisposable | null>(null);

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  const containerId = container.Id;
  const containerName = formatContainerName(container.Names ?? []);

  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return;

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
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    xterm.loadAddon(fitAddon);
    xterm.loadAddon(webLinksAddon);

    xterm.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    const handleResize = () => {
      fitAddon.fit();
      if (sessionRef.current?.isConnected) {
        sessionRef.current.resize(xterm.cols, xterm.rows);
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(terminalRef.current);
    window.addEventListener('resize', handleResize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
      inputDisposableRef.current?.dispose();
      inputDisposableRef.current = null;
      xterm.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!containerId) return;
    const xterm = xtermRef.current;
    if (!xterm) return;

    let cancelled = false;

    sessionRef.current?.disconnect();
    sessionRef.current = null;
    inputDisposableRef.current?.dispose();
    inputDisposableRef.current = null;

    setIsConnecting(true);
    setIsConnected(false);
    xterm.clear();
    xterm.writeln(`Connecting to ${containerName}...`);
    xterm.writeln('');

    const session = new ShellSession({
      context,
      container: containerId,
      onData: (data) => {
        if (cancelled) return;
        xterm.write(data);
      },
      onError: (err) => {
        if (cancelled) return;
        xterm.writeln(`\r\n\x1b[31mError: ${err}\x1b[0m`);
      },
      onClose: () => {
        if (cancelled) return;
        setIsConnected(false);
        xterm.writeln('\r\n\x1b[33mConnection closed.\x1b[0m');
      },
    });

    (async () => {
      try {
        await session.connect();
        if (cancelled) {
          session.disconnect();
          return;
        }
        sessionRef.current = session;
        setIsConnected(true);

        const fitAddon = fitAddonRef.current;
        if (fitAddon) {
          fitAddon.fit();
          session.resize(xterm.cols, xterm.rows);
        }

        inputDisposableRef.current = xterm.onData((data: string) => {
          session.send(data);
        });
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Failed to connect';
        xterm.writeln(`\r\n\x1b[31mFailed to connect: ${message}\x1b[0m`);
      } finally {
        if (!cancelled) {
          setIsConnecting(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      session.disconnect();
      if (sessionRef.current === session) {
        sessionRef.current = null;
      }
      inputDisposableRef.current?.dispose();
      inputDisposableRef.current = null;
    };
  }, [context, containerId, containerName]);

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a]">
      <div ref={terminalRef} className="flex-1 p-2" style={{ minHeight: 0 }} />

      <div className="shrink-0 px-4 py-1.5 border-t border-neutral-800 bg-neutral-900/50 flex items-center gap-3 text-xs text-neutral-500">
        <span className="flex items-center gap-1.5">
          <span
            className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-500' : isConnecting ? 'bg-amber-500 animate-pulse' : 'bg-neutral-600'}`}
          />
          {isConnected ? 'Connected' : isConnecting ? 'Connecting...' : 'Disconnected'}
        </span>
        <span className="text-neutral-600">{containerName}</span>
      </div>
    </div>
  );
}

export function DockerTerminalViewer(props: DockerTerminalViewerProps) {
  return <TerminalViewerInner key={`${props.context}/${props.container.Id ?? ''}`} {...props} />;
}
