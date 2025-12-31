// Kubernetes pod exec WebSocket API for terminal access
// Uses the Kubernetes exec API directly through the proxy

// Kubernetes exec channel prefixes
const CHANNEL_STDIN = 0;
const CHANNEL_STDOUT = 1;
const CHANNEL_STDERR = 2;
// const CHANNEL_ERROR = 3;
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
  private hasConnected = false;

  constructor(options: ExecSessionOptions) {
    this.options = options;
  }

  // Try to connect with different shells until one works
  async connect(): Promise<void> {
    const shells = this.options.command || DEFAULT_SHELLS;
    
    for (const shell of shells) {
      try {
        await this.tryConnect([shell]);
        this.hasConnected = true; // Mark as connected only after successful shell
        return; // Success!
      } catch {
        // If this is the last shell, throw the error
        if (shell === shells[shells.length - 1]) {
          throw new Error(`No shell available (tried: ${shells.join(', ')})`);
        }
        // Otherwise try the next shell
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
      const url = `${protocol}//${window.location.host}/contexts/${context}/api/v1/namespaces/${namespace}/pods/${pod}/exec?${params.toString()}`;
      
      this.ws = new WebSocket(url, ['v4.channel.k8s.io']);
      
      let resolved = false;
      
      // Set a connection timeout
      const connectionTimeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.ws?.close();
          reject(new Error('Connection timeout'));
        }
      }, 5000);
      
      this.ws.binaryType = 'arraybuffer';
      
      this.ws.onopen = () => {
        // Don't resolve immediately - wait for first data or a short delay
        // to confirm the shell actually started
        setTimeout(() => {
          if (!resolved && this.ws?.readyState === WebSocket.OPEN) {
            clearTimeout(connectionTimeout);
            resolved = true;
            resolve();
          }
        }, 200);
      };
      
      this.ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
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
          }
        }
      };
      
      this.ws.onerror = () => {
        clearTimeout(connectionTimeout);
        if (!resolved) {
          resolved = true;
          reject(new Error('WebSocket connection failed'));
        }
      };
      
      this.ws.onclose = (event) => {
        clearTimeout(connectionTimeout);
        if (!resolved) {
          resolved = true;
          reject(new Error(event.reason || `Connection closed (code: ${event.code})`));
        } else if (!this.isClosing && this.hasConnected) {
          // Only call onClose if we had a successful connection (not during shell detection)
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
