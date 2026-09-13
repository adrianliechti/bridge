import { useState, useRef, useEffect } from 'react';
import { Terminal as XTerm, type IDisposable } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { ChevronDown } from 'lucide-react';
import { ExecSession } from '../../api/kubernetes/kubernetesExec';
import type { KubernetesResource } from '../../api/kubernetes/kubernetes';
import { ToolbarPortal } from '../ToolbarPortal';
import '@xterm/xterm/css/xterm.css';

export interface TerminalViewerProps {
  context: string;
  resource: KubernetesResource;
  toolbarRef?: React.RefObject<HTMLDivElement | null>;
}

interface ContainerInfo {
  name: string;
  ready: boolean;
}

function getPodContainers(resource: KubernetesResource): ContainerInfo[] {
  const containers: ContainerInfo[] = [];

  const spec = resource.spec as { containers?: Array<{ name: string }> } | undefined;
  const status = resource.status as
    | { containerStatuses?: Array<{ name: string; ready: boolean }> }
    | undefined;

  if (spec?.containers) {
    for (const container of spec.containers) {
      const containerStatus = status?.containerStatuses?.find((s) => s.name === container.name);
      containers.push({
        name: container.name,
        ready: containerStatus?.ready ?? false,
      });
    }
  }

  return containers;
}

function getResourceKey(context: string, resource: KubernetesResource): string {
  return `${context}/${resource.metadata?.namespace ?? ''}/${resource.metadata?.name ?? ''}`;
}

function TerminalViewerInner({ context, resource, toolbarRef }: TerminalViewerProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const sessionRef = useRef<ExecSession | null>(null);
  const inputDisposableRef = useRef<IDisposable | null>(null);

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [requestedContainer, setRequestedContainer] = useState<string | null>(null);
  const [showContainerDropdown, setShowContainerDropdown] = useState(false);

  const namespace = resource.metadata?.namespace;
  const podName = resource.metadata?.name;
  const containers = getPodContainers(resource);

  const selectedContainer =
    requestedContainer && containers.some((c) => c.name === requestedContainer)
      ? requestedContainer
      : (containers[0]?.name ?? '');

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
    if (!namespace || !podName || !selectedContainer) return;
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
    xterm.writeln(`Connecting to ${podName}/${selectedContainer}...`);
    xterm.writeln('');

    const session = new ExecSession({
      context,
      namespace,
      pod: podName,
      container: selectedContainer,
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
  }, [context, namespace, podName, selectedContainer]);

  const handleContainerChange = (containerName: string) => {
    setShowContainerDropdown(false);
    if (containerName === selectedContainer) return;
    setRequestedContainer(containerName);
  };

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a]">
      {toolbarRef && (
        <ToolbarPortal toolbarRef={toolbarRef}>
          {containers.length > 1 && (
            <div className="relative">
              <button
                onClick={() => setShowContainerDropdown(!showContainerDropdown)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded transition-colors"
              >
                <span className="max-w-30 truncate" title={selectedContainer}>
                  {selectedContainer}
                </span>
                <ChevronDown size={12} />
              </button>

              {showContainerDropdown && (
                <div className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg py-1 min-w-40">
                  {containers.map((container) => (
                    <button
                      key={container.name}
                      onClick={() => handleContainerChange(container.name)}
                      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center gap-2 ${
                        container.name === selectedContainer
                          ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10'
                          : 'text-neutral-700 dark:text-neutral-300'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${container.ready ? 'bg-emerald-500' : 'bg-neutral-400'}`}
                      />
                      {container.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </ToolbarPortal>
      )}

      <div ref={terminalRef} className="flex-1 p-2" style={{ minHeight: 0 }} />

      <div className="shrink-0 px-4 py-1.5 border-t border-neutral-800 bg-neutral-900/50 flex items-center gap-3 text-xs text-neutral-500">
        <span className="flex items-center gap-1.5">
          <span
            className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-500' : isConnecting ? 'bg-amber-500 animate-pulse' : 'bg-neutral-600'}`}
          />
          {isConnected ? 'Connected' : isConnecting ? 'Connecting...' : 'Disconnected'}
        </span>
        {selectedContainer && (
          <span className="text-neutral-600">
            {podName}/{selectedContainer}
          </span>
        )}
      </div>
    </div>
  );
}

export function TerminalViewer(props: TerminalViewerProps) {
  return <TerminalViewerInner key={getResourceKey(props.context, props.resource)} {...props} />;
}
