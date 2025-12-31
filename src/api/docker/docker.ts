// Docker API client
// Using types from @docker/node-sdk (https://github.com/docker/node-sdk)

import type {
  ContainerSummary,
  ContainerInspectResponse,
  ImageSummary,
  SystemInfo,
  PortSummary,
} from '@docker/node-sdk';

// Re-export SDK types for convenience
export type {
  ContainerSummary,
  ContainerInspectResponse,
  ImageSummary,
  SystemInfo,
  PortSummary,
  ContainerState,
  MountPoint,
  EndpointSettings,
  ContainerConfig,
  HostConfig,
  NetworkSettings,
} from '@docker/node-sdk';

// Type aliases for backward compatibility
export type DockerContainer = ContainerSummary;
export type ContainerInspect = ContainerInspectResponse;
export type DockerImage = ImageSummary;
export type DockerInfo = SystemInfo;
export type DockerPort = PortSummary;

// Base fetch helper for Docker API calls
async function fetchDockerApi<T>(path: string): Promise<T> {
  const response = await fetch(`/docker${path}`);
  if (!response.ok) {
    throw new Error(`Docker API request failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

// List all containers
export async function listContainers(all = true): Promise<DockerContainer[]> {
  return fetchDockerApi<DockerContainer[]>(`/containers/json?all=${all}`);
}

// Get container details
export async function inspectContainer(id: string): Promise<ContainerInspect> {
  return fetchDockerApi<ContainerInspect>(`/containers/${id}/json`);
}

// List all images
export async function listImages(): Promise<DockerImage[]> {
  return fetchDockerApi<DockerImage[]>('/images/json');
}

// Get Docker daemon info
export async function getInfo(): Promise<DockerInfo> {
  return fetchDockerApi<DockerInfo>('/info');
}

// Container control functions
async function postDockerApi(path: string): Promise<void> {
  const response = await fetch(`/docker${path}`, { method: 'POST' });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Docker API request failed: ${response.status} ${response.statusText}`);
  }
}

async function deleteDockerApi(path: string): Promise<void> {
  const response = await fetch(`/docker${path}`, { method: 'DELETE' });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Docker API request failed: ${response.status} ${response.statusText}`);
  }
}

// Start a container
export async function startContainer(id: string): Promise<void> {
  return postDockerApi(`/containers/${id}/start`);
}

// Stop a container
export async function stopContainer(id: string): Promise<void> {
  return postDockerApi(`/containers/${id}/stop`);
}

// Restart a container
export async function restartContainer(id: string): Promise<void> {
  return postDockerApi(`/containers/${id}/restart`);
}

// Pause a container
export async function pauseContainer(id: string): Promise<void> {
  return postDockerApi(`/containers/${id}/pause`);
}

// Unpause a container
export async function unpauseContainer(id: string): Promise<void> {
  return postDockerApi(`/containers/${id}/unpause`);
}

// Remove a container
export async function removeContainer(id: string, force = false): Promise<void> {
  return deleteDockerApi(`/containers/${id}?force=${force}`);
}

// Stream container logs (returns a ReadableStream)
export interface ContainerLogsOptions {
  follow?: boolean;
  stdout?: boolean;
  stderr?: boolean;
  timestamps?: boolean;
  tail?: string | number;
  since?: number;
  until?: number;
}

export function getContainerLogsUrl(containerId: string, options: ContainerLogsOptions = {}): string {
  const params = new URLSearchParams();
  params.set('stdout', String(options.stdout ?? true));
  params.set('stderr', String(options.stderr ?? true));
  params.set('timestamps', String(options.timestamps ?? true));
  
  if (options.follow) {
    params.set('follow', 'true');
  }
  if (options.tail !== undefined) {
    params.set('tail', String(options.tail));
  }
  if (options.since !== undefined) {
    params.set('since', String(options.since));
  }
  if (options.until !== undefined) {
    params.set('until', String(options.until));
  }

  return `/docker/containers/${containerId}/logs?${params.toString()}`;
}

// Fetch container logs (non-streaming)
export async function getContainerLogs(containerId: string, options: ContainerLogsOptions = {}): Promise<string> {
  const url = getContainerLogsUrl(containerId, { ...options, follow: false });
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch logs: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

// Stream container logs with Docker multiplexed stream demuxing
// Docker log format: [STREAM_TYPE(1)][0][0][0][SIZE(4 bytes big-endian)][PAYLOAD]
// STREAM_TYPE: 0=stdin, 1=stdout, 2=stderr
export async function streamContainerLogs(
  containerId: string,
  options: ContainerLogsOptions,
  onLine: (line: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const url = getContainerLogsUrl(containerId, { ...options, follow: true });
  
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Failed to stream logs: ${response.status} ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  let buffer: number[] = [];
  let textBuffer = '';
  let isMultiplexed: boolean | null = null; // null = unknown, true = multiplexed, false = raw

  // Process text into lines
  const processText = (text: string) => {
    textBuffer += text;
    const lines = textBuffer.split('\n');
    textBuffer = lines.pop() || '';
    for (const line of lines) {
      if (line.trim()) {
        onLine(line);
      }
    }
  };

  // Process raw stream (no multiplexing - used when TTY is enabled)
  const processRawStream = (data: Uint8Array) => {
    const text = decoder.decode(data, { stream: true });
    processText(text);
  };

  // Process multiplexed stream
  const processMultiplexedStream = () => {
    while (buffer.length >= 8) {
      // Read header: first byte is stream type, bytes 4-7 are big-endian size
      const size = (buffer[4] << 24) | (buffer[5] << 16) | (buffer[6] << 8) | buffer[7];

      // Check if we have the full frame
      if (buffer.length < 8 + size) {
        break; // Wait for more data
      }

      // Extract payload
      const payload = new Uint8Array(buffer.slice(8, 8 + size));
      buffer = buffer.slice(8 + size);

      // Decode and process
      const text = decoder.decode(payload, { stream: true });
      processText(text);
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Detect stream format on first chunk
      if (isMultiplexed === null && value.length > 0) {
        // Docker multiplexed streams start with stream type byte (0, 1, or 2)
        // followed by 3 zero bytes. If first byte is > 2 or bytes 1-3 aren't zero,
        // it's likely raw text (TTY mode)
        const firstByte = value[0];
        if (value.length >= 4 && firstByte <= 2 && value[1] === 0 && value[2] === 0 && value[3] === 0) {
          isMultiplexed = true;
        } else {
          isMultiplexed = false;
        }
      }

      if (isMultiplexed) {
        // Append new data to buffer for multiplexed processing
        buffer.push(...value);
        processMultiplexedStream();
      } else {
        // Process as raw text
        processRawStream(value);
      }
    }

    // Process remaining text buffer
    if (textBuffer.trim()) {
      onLine(textBuffer);
    }
  } finally {
    reader.releaseLock();
  }
}

// Helper to format container name (remove leading /)
export function formatContainerName(names: string[]): string {
  if (!names || names.length === 0) return 'unnamed';
  // Docker container names start with /
  return names[0].replace(/^\//, '');
}

// Helper to format image size
export function formatImageSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// Helper to format timestamp
export function formatCreatedTime(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleString();
}

// Helper to get container state color
export function getContainerStateColor(state: string): string {
  switch (state.toLowerCase()) {
    case 'running':
      return 'text-emerald-500';
    case 'paused':
      return 'text-amber-500';
    case 'restarting':
      return 'text-blue-500';
    case 'exited':
    case 'dead':
      return 'text-red-500';
    case 'created':
      return 'text-neutral-500';
    default:
      return 'text-neutral-400';
  }
}

// Table adapters - convert Docker data to TableResponse format
import type { TableResponse, TableColumnDefinition } from '../../types/table';

// Helper to format ports for table display
function formatPortsForTable(ports: DockerPort[]): string {
  if (!ports || ports.length === 0) return '-';
  return ports
    .filter(p => p.PublicPort)
    .map(p => `${p.PublicPort}:${p.PrivatePort}/${p.Type}`)
    .join(', ') || '-';
}

// Helper to format created timestamp as age
function formatAgeFromUnix(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

// Convert Docker containers to table format
export function dockerContainersToTable(containers: DockerContainer[]): TableResponse<DockerContainer> {
  const columnDefinitions: TableColumnDefinition[] = [
    { name: 'Name', type: 'string', format: '', description: 'Container name', priority: 0 },
    { name: 'Image', type: 'string', format: '', description: 'Container image', priority: 0 },
    { name: 'Status', type: 'string', format: '', description: 'Container status', priority: 0 },
    { name: 'State', type: 'string', format: '', description: 'Container state', priority: 1 },
    { name: 'Ports', type: 'string', format: '', description: 'Published ports', priority: 1 },
    { name: 'Age', type: 'string', format: 'date-time', description: 'Time since created', priority: 1 },
  ];

  const rows = containers.map(container => ({
    cells: [
      formatContainerName(container.Names ?? []),
      container.Image ?? '',
      container.Status ?? '',
      container.State ?? '',
      formatPortsForTable(container.Ports ?? []),
      formatAgeFromUnix(container.Created ?? 0),
    ],
    object: container,
  }));

  return { columnDefinitions, rows };
}

// Convert Docker images to table format
export function dockerImagesToTable(images: DockerImage[]): TableResponse<DockerImage> {
  const columnDefinitions: TableColumnDefinition[] = [
    { name: 'Repository', type: 'string', format: '', description: 'Image repository', priority: 0 },
    { name: 'Tag', type: 'string', format: '', description: 'Image tag', priority: 0 },
    { name: 'Image ID', type: 'string', format: '', description: 'Image identifier', priority: 0 },
    { name: 'Size', type: 'string', format: '', description: 'Image size', priority: 1 },
    { name: 'Age', type: 'string', format: 'date-time', description: 'Time since created', priority: 1 },
  ];

  const rows = images.map(image => {
    const repoTag = image.RepoTags?.[0] || '<none>:<none>';
    const [repository, tag] = repoTag.split(':');

    return {
      cells: [
        repository || '<none>',
        tag || '<none>',
        image.Id.replace('sha256:', '').substring(0, 12),
        formatImageSize(image.Size),
        formatAgeFromUnix(image.Created),
      ],
      object: image,
    };
  });

  return { columnDefinitions, rows };
}

