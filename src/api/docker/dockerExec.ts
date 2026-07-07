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
  private hasConnected = false;

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
      const url = `${protocol}//${window.location.host}/contexts/${context}/shell/${container}?${params.toString()}`;

      this.ws = new WebSocket(url);

      let resolved = false;

      const connectionTimeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.ws?.close();
          reject(new Error('Connection timeout'));
        }
      }, 5000);

      this.ws.binaryType = 'arraybuffer';

      this.ws.onopen = () => {
        // Wait briefly to let an immediate error (channel 3) reject first
        setTimeout(() => {
          if (resolved) return;
          if (this.isClosing) {
            clearTimeout(connectionTimeout);
            resolved = true;
            reject(new Error('Connection cancelled'));
            return;
          }
          if (this.ws?.readyState === WebSocket.OPEN) {
            clearTimeout(connectionTimeout);
            resolved = true;
            this.hasConnected = true;
            resolve();
          }
        }, 200);
      };

      this.ws.onmessage = (event) => {
        if (!(event.data instanceof ArrayBuffer)) return;

        const data = new Uint8Array(event.data);
        if (data.length < 1) return;

        const channel = data[0];
        const content = new TextDecoder().decode(data.slice(1));

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
              this.ws?.close();
              reject(new Error(content));
            } else if (!this.isClosing) {
              this.options.onError?.(content);
            }
            break;
        }
      };

      this.ws.onerror = () => {
        clearTimeout(connectionTimeout);
        if (!resolved) {
          resolved = true;
          this.ws?.close();
          reject(new Error('WebSocket connection failed'));
        }
      };

      this.ws.onclose = (event) => {
        clearTimeout(connectionTimeout);
        if (!resolved) {
          resolved = true;
          reject(new Error(event.reason || `Connection closed (code: ${event.code})`));
        } else if (!this.isClosing && this.hasConnected) {
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
