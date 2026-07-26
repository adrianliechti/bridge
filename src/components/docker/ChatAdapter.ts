// Docker chat adapter with TanStack AI tools
import { toolDefinition } from '@tanstack/ai';
import { clientTools } from '@tanstack/ai-client';
import { z } from 'zod';
import {
  listContainers,
  listImages,
  inspectContainer,
  getContainerLogs,
  formatContainerName,
} from '../../api/docker/docker';
import type { ChatEnvironment } from '../../types/chat';

export interface DockerEnvironment extends ChatEnvironment {
  context: string;
  selectedContainerId?: string;
  selectedContainerName?: string;
  selectedResourceType?: 'applications' | 'containers' | 'images' | 'volumes' | 'networks';
}

// Zod schemas for tool inputs
const listContainersSchema = z.object({
  all: z.boolean().optional().describe('Whether to include stopped containers (default: true)'),
});

const listImagesSchema = z.object({});

const inspectContainerSchema = z.object({
  container: z.string().describe('The container name or ID'),
});

const getContainerLogsSchema = z.object({
  container: z.string().describe('The container name or ID'),
  tail: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Number of lines to return from the end of the logs (default: 100)'),
});

// Tool definitions with Zod schemas
const listContainersDef = toolDefinition({
  name: 'list_containers',
  description: 'List all Docker containers (running and stopped)',
  inputSchema: listContainersSchema,
});

const listImagesDef = toolDefinition({
  name: 'list_images',
  description: 'List all Docker images on the system',
  inputSchema: listImagesSchema,
});

const inspectContainerDef = toolDefinition({
  name: 'inspect_container',
  description: 'Get detailed information about a specific container',
  inputSchema: inspectContainerSchema,
});

const getContainerLogsDef = toolDefinition({
  name: 'get_container_logs',
  description: 'Get logs from a specific container',
  inputSchema: getContainerLogsSchema,
});

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// Resolve a container reference (name or ID prefix) to a container
async function findContainer(context: string, ref: string) {
  const containers = await listContainers(context, true);
  return containers.find(
    (c) =>
      c.Id?.startsWith(ref) || formatContainerName(c.Names ?? []).toLowerCase() === ref.toLowerCase(),
  );
}

// Create client tool implementations
export function createDockerTools(environment: DockerEnvironment) {
  const context = environment.context;

  const listContainersTool = listContainersDef.client(async ({ all }) => {
    const containers = await listContainers(context, all ?? true);

    return {
      containers: containers.map((c) => ({
        id: c.Id?.substring(0, 12),
        name: formatContainerName(c.Names ?? []),
        image: c.Image,
        state: c.State,
        status: c.Status,
        ports: c.Ports?.filter((p) => p.PublicPort).map(
          (p) => `${p.PublicPort}:${p.PrivatePort}/${p.Type}`,
        ),
      })),
    };
  });

  const listImagesTool = listImagesDef.client(async () => {
    const images = await listImages(context);

    return {
      images: images.map((img) => {
        // Split on the last colon — repositories may contain a registry port
        const repoTag = img.RepoTags?.[0] || '<none>:<none>';
        const splitAt = repoTag.lastIndexOf(':');
        return {
          id: img.Id.replace('sha256:', '').substring(0, 12),
          repository: repoTag.slice(0, splitAt),
          tag: repoTag.slice(splitAt + 1),
          size: formatSize(img.Size),
          created: new Date(img.Created * 1000).toISOString(),
        };
      }),
    };
  });

  const inspectContainerTool = inspectContainerDef.client(async ({ container }) => {
    const found = await findContainer(context, container);
    if (!found?.Id) {
      return { error: `Container not found: ${container}` };
    }

    const details = await inspectContainer(context, found.Id);

    return {
      id: details.Id?.substring(0, 12),
      name: details.Name?.replace(/^\//, ''),
      image: details.Config?.Image,
      state: {
        status: details.State?.Status,
        running: details.State?.Running,
        startedAt: details.State?.StartedAt,
        finishedAt: details.State?.FinishedAt,
        exitCode: details.State?.ExitCode,
      },
      config: {
        env: details.Config?.Env,
        cmd: details.Config?.Cmd,
        workingDir: details.Config?.WorkingDir,
        exposedPorts: details.Config?.ExposedPorts ? Object.keys(details.Config.ExposedPorts) : [],
      },
      hostConfig: {
        portBindings: details.HostConfig?.PortBindings,
        binds: details.HostConfig?.Binds,
        networkMode: details.HostConfig?.NetworkMode,
        restartPolicy: details.HostConfig?.RestartPolicy,
      },
      networkSettings: {
        ipAddress: details.NetworkSettings?.IPAddress,
        networks: details.NetworkSettings?.Networks
          ? Object.keys(details.NetworkSettings.Networks)
          : [],
      },
      mounts: details.Mounts?.map((m) => ({
        type: m.Type,
        source: m.Source,
        destination: m.Destination,
        mode: m.Mode,
      })),
    };
  });

  const getContainerLogsTool = getContainerLogsDef.client(async ({ container, tail }) => {
    const found = await findContainer(context, container);
    if (!found?.Id) {
      return { error: `Container not found: ${container}` };
    }

    const logs = await getContainerLogs(context, found.Id, { tail: tail ?? 100 });
    return { logs: logs || '(no logs available)' };
  });

  return clientTools(
    listContainersTool,
    listImagesTool,
    inspectContainerTool,
    getContainerLogsTool,
  );
}

// Build system instructions based on environment
export function buildDockerInstructions(environment: DockerEnvironment): string {
  let contextInfo = '';
  const parts: string[] = [];

  if (environment.selectedResourceType) {
    parts.push(`- Currently viewing: ${environment.selectedResourceType}`);
  }
  if (environment.selectedContainerName) {
    parts.push(`- Currently selected container: ${environment.selectedContainerName}`);
  }

  if (parts.length > 0) {
    contextInfo = `\n\nThe user is currently viewing:\n${parts.join('\n')}\n\nUse this context to provide more relevant answers.`;
  }

  return `You are a helpful Docker assistant. You can help users understand and manage their Docker containers and images.
When users ask about containers or images, use the available tools to fetch real data from the Docker daemon.
Provide clear, concise explanations and highlight any issues or warnings you find.
Format your responses using markdown for better readability.${contextInfo}`;
}

// Adapter metadata
export const dockerAdapterConfig = {
  id: 'docker',
  name: 'Docker Assistant',
  placeholder: 'Ask about your containers and images...',
};
