// Container shell WebSocket API for terminal access.
// Connects to the bridge backend shell endpoint (/contexts/{ctx}/shell/{id}),
// which serves docker contexts via the Engine exec API and Apple container
// contexts via `container exec`. The wire format matches the Kubernetes exec
// channel protocol: a channel byte prefix on each binary message.

// Channel prefixes
const CHANNEL_STDIN = 0;
const CHANNEL_STDOUT = 1;
const CHANNEL_STDERR = 2;
const CHANNEL_ERROR = 3;
const CHANNEL_RESIZE = 4;

export interface ShellSessionOptions {
  context: string;
  /** Container ID or name */
  container: string;
  command?: string[];
  onData: (data: string) => void;
  onError?: (error: string) => void;
  onClose?: () => void;
}

const DEFAULT_SHELL = ['/bin/sh'];

export class ShellSession {
  private ws: WebSocket | null = null;
  private options: ShellSessionOptions;
  private isClosing = false;

  constructor(options: ShellSessionOptions) {
    this.options = options;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const { context, container } = this.options;

      const params = new URLSearchParams();
      for (const cmd of this.options.command ?? DEFAULT_SHELL) {
        params.append('command', cmd);
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${protocol}//${window.location.host}/contexts/${encodeURIComponent(context)}/shell/${encodeURIComponent(container)}?${params.toString()}`;

      const ws = new WebSocket(url);
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

      const connectionTimeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          ws.close();
          reject(new Error('Connection timeout'));
        }
      }, 5000);

      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        // Wait briefly to let an immediate error (channel 3) reject first
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
        if (this.isClosing || this.ws !== ws || !(event.data instanceof ArrayBuffer)) return;

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
          case CHANNEL_ERROR:
            if (!content) break;
            if (!resolved) {
              resolved = true;
              clearTimeout(connectionTimeout);
              ws.close();
              reject(new Error(content));
            } else if (!this.isClosing) {
              this.options.onError?.(content);
            }
            break;
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
      const payload = new TextEncoder().encode(data);
      const message = new Uint8Array(payload.length + 1);
      message[0] = CHANNEL_STDIN;
      message.set(payload, 1);
      this.ws.send(message);
    }
  }

  resize(cols: number, rows: number): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const payload = new TextEncoder().encode(JSON.stringify({ Width: cols, Height: rows }));
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
