// Kubernetes pod exec WebSocket API for terminal access
// Uses the Kubernetes exec API directly through the proxy

// Kubernetes exec channel prefixes
const CHANNEL_STDIN = 0;
const CHANNEL_STDOUT = 1;
const CHANNEL_STDERR = 2;
const CHANNEL_ERROR = 3;
const CHANNEL_RESIZE = 4;

export interface ExecSessionOptions {
  context: string;
  namespace: string;
  pod: string;
  container: string;
  command?: string[];
  onData: (data: string) => void;
  onError?: (error: string) => void;
  onClose?: () => void;
}

const DEFAULT_SHELLS = ['/bin/bash', '/bin/sh'];

export class ExecSession {
  private ws: WebSocket | null = null;
  private options: ExecSessionOptions;
  private isClosing = false;

  constructor(options: ExecSessionOptions) {
    this.options = options;
  }

  // Try to connect with different shells until one works
  async connect(): Promise<void> {
    const commands = this.options.command
      ? [this.options.command]
      : DEFAULT_SHELLS.map((shell) => [shell]);

    for (const [index, command] of commands.entries()) {
      if (this.isClosing) return;
      try {
        await this.tryConnect(command);
        return;
      } catch (error) {
        if (this.isClosing) return;
        if (index === commands.length - 1) {
          // Preserve permission/transport errors instead of reporting every
          // failure as a missing shell.
          throw error;
        }
      }
    }
  }

  private tryConnect(command: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const { context, namespace, pod, container } = this.options;

      // Build Kubernetes exec API URL with query params
      const params = new URLSearchParams();
      params.set('container', container);
      params.set('stdin', 'true');
      params.set('stdout', 'true');
      params.set('stderr', 'true');
      params.set('tty', 'true');

      for (const cmd of command) {
        params.append('command', cmd);
      }

      // Connect through the proxy to Kubernetes exec API
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${protocol}//${window.location.host}/contexts/${encodeURIComponent(context)}/api/v1/namespaces/${encodeURIComponent(namespace)}/pods/${encodeURIComponent(pod)}/exec?${params.toString()}`;

      const ws = new WebSocket(url, ['v4.channel.k8s.io']);
      this.ws = ws;

      let resolved = false;
      let connected = false;
      let readyTimeout: ReturnType<typeof setTimeout> | undefined;
      // stdout and stderr are independent byte streams; UTF-8 characters may
      // span multiple WebSocket messages.
      const decoders = new Map([
        [CHANNEL_STDOUT, new TextDecoder()],
        [CHANNEL_STDERR, new TextDecoder()],
      ]);

      // Set a connection timeout
      const connectionTimeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          ws.close();
          reject(new Error('Connection timeout'));
        }
      }, 5000);

      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        // Don't resolve immediately - wait for first data or a short delay
        // to confirm the shell actually started
        readyTimeout = setTimeout(() => {
          if (resolved) return;
          if (this.isClosing) {
            clearTimeout(connectionTimeout);
            resolved = true;
            reject(new Error('Connection cancelled'));
            return;
          }
          if (ws.readyState === WebSocket.OPEN) {
            clearTimeout(connectionTimeout);
            resolved = true;
            connected = true;
            resolve();
          }
        }, 200);
      };

      ws.onmessage = (event) => {
        if (this.isClosing || this.ws !== ws) return;
        if (event.data instanceof ArrayBuffer) {
          const data = new Uint8Array(event.data);
          if (data.length < 1) return;

          const channel = data[0];
          const decoder = decoders.get(channel);
          const content = decoder
            ? decoder.decode(data.subarray(1), { stream: true })
            : new TextDecoder().decode(data.subarray(1));

          switch (channel) {
            case CHANNEL_STDOUT:
            case CHANNEL_STDERR:
              if (content) {
                this.options.onData(content);
              }
              break;
            case CHANNEL_ERROR: {
              // The error channel carries a metav1.Status JSON payload, e.g.
              // "executable file not found" when the requested shell doesn't
              // exist. Before the connection resolves this must reject so the
              // shell fallback (/bin/bash → /bin/sh) actually happens —
              // otherwise the 200ms onopen heuristic can declare a dead shell
              // "connected". After resolving, surface failures to the caller.
              if (!content) break;
              let failureMessage: string | null = content;
              try {
                const status = JSON.parse(content) as { status?: string; message?: string };
                failureMessage = status.status === 'Success' ? null : status.message || content;
              } catch {
                // Not JSON — treat the raw text as the failure message.
              }
              if (!failureMessage) break;
              if (!resolved) {
                resolved = true;
                clearTimeout(connectionTimeout);
                ws.close();
                reject(new Error(failureMessage));
              } else if (!this.isClosing) {
                this.options.onError?.(failureMessage);
              }
              break;
            }
          }
        }
      };

      ws.onerror = () => {
        clearTimeout(connectionTimeout);
        if (!resolved) {
          resolved = true;
          ws.close();
          reject(new Error('WebSocket connection failed'));
        }
      };

      ws.onclose = (event) => {
        clearTimeout(connectionTimeout);
        clearTimeout(readyTimeout);
        if (!resolved) {
          resolved = true;
          reject(new Error(event.reason || `Connection closed (code: ${event.code})`));
        } else if (!this.isClosing && connected && this.ws === ws) {
          // Only call onClose if we had a successful connection (not during shell detection)
          for (const decoder of decoders.values()) {
            const remaining = decoder.decode();
            if (remaining) this.options.onData(remaining);
          }
          this.options.onClose?.();
        }
      };
    });
  }

  send(data: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const encoder = new TextEncoder();
      const payload = encoder.encode(data);
      const message = new Uint8Array(payload.length + 1);
      message[0] = CHANNEL_STDIN;
      message.set(payload, 1);
      this.ws.send(message);
    }
  }

  resize(cols: number, rows: number): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const resizeMsg = JSON.stringify({ Width: cols, Height: rows });
      const encoder = new TextEncoder();
      const payload = encoder.encode(resizeMsg);
      const message = new Uint8Array(payload.length + 1);
      message[0] = CHANNEL_RESIZE;
      message.set(payload, 1);
      this.ws.send(message);
    }
  }

  disconnect(): void {
    this.isClosing = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// Helper function to create and connect an exec session
export async function createExecSession(options: ExecSessionOptions): Promise<ExecSession> {
  const session = new ExecSession(options);
  await session.connect();
  return session;
}
