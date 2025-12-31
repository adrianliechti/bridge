// Docker chat adapter
import type { Tool, ToolCall, ToolResult } from '../../api/openai/openai';
import type { ChatAdapter, ChatEnvironment } from '../../types/chat';
import { listContainers, listImages, inspectContainer, getContainerLogs, formatContainerName } from '../../api/docker/docker';

export interface DockerEnvironment extends ChatEnvironment {
  selectedContainerId?: string;
  selectedContainerName?: string;
  selectedResourceType?: 'containers' | 'images' | 'volumes' | 'networks';
}

// Docker API tools
const dockerTools: Tool[] = [
  {
    name: 'list_containers',
    description: 'List all Docker containers (running and stopped)',
    parameters: {
      type: 'object',
      properties: {
        all: {
          type: 'string',
          description: 'Whether to include stopped containers (default: true)',
        },
      },
      required: [],
    },
  },
  {
    name: 'list_images',
    description: 'List all Docker images on the system',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'inspect_container',
    description: 'Get detailed information about a specific container',
    parameters: {
      type: 'object',
      properties: {
        container: {
          type: 'string',
          description: 'The container name or ID',
        },
      },
      required: ['container'],
    },
  },
  {
    name: 'get_container_logs',
    description: 'Get logs from a specific container',
    parameters: {
      type: 'object',
      properties: {
        container: {
          type: 'string',
          description: 'The container name or ID',
        },
        tail: {
          type: 'string',
          description: 'Number of lines to return from the end of the logs (default: 100)',
        },
      },
      required: ['container'],
    },
  },
];

// Execute Docker tool calls
async function executeDocker(
  toolName: string,
  args: Record<string, string>
): Promise<unknown> {
  switch (toolName) {
    case 'list_containers': {
      const all = args.all !== 'false';
      const containers = await listContainers(all);
      
      return {
        containers: containers.map(c => ({
          id: c.Id?.substring(0, 12),
          name: formatContainerName(c.Names ?? []),
          image: c.Image,
          state: c.State,
          status: c.Status,
          ports: c.Ports?.filter(p => p.PublicPort).map(p => `${p.PublicPort}:${p.PrivatePort}/${p.Type}`),
        })),
      };
    }

    case 'list_images': {
      const images = await listImages();
      
      return {
        images: images.map(img => {
          const repoTag = img.RepoTags?.[0] || '<none>:<none>';
          const [repository, tag] = repoTag.split(':');
          return {
            id: img.Id.replace('sha256:', '').substring(0, 12),
            repository,
            tag,
            size: formatSize(img.Size),
            created: new Date(img.Created * 1000).toISOString(),
          };
        }),
      };
    }

    case 'inspect_container': {
      try {
        // Try to find container by name or ID
        const containers = await listContainers(true);
        const container = containers.find(c => 
          c.Id?.startsWith(args.container) || 
          formatContainerName(c.Names ?? []).toLowerCase() === args.container.toLowerCase()
        );
        
        if (!container?.Id) {
          return { error: `Container not found: ${args.container}` };
        }
        
        const details = await inspectContainer(container.Id);
        
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
            networks: details.NetworkSettings?.Networks ? Object.keys(details.NetworkSettings.Networks) : [],
          },
          mounts: details.Mounts?.map(m => ({
            type: m.Type,
            source: m.Source,
            destination: m.Destination,
            mode: m.Mode,
          })),
        };
      } catch (error) {
        return { error: `Failed to inspect container: ${error}` };
      }
    }

    case 'get_container_logs': {
      try {
        // Try to find container by name or ID
        const containers = await listContainers(true);
        const container = containers.find(c => 
          c.Id?.startsWith(args.container) || 
          formatContainerName(c.Names ?? []).toLowerCase() === args.container.toLowerCase()
        );
        
        if (!container?.Id) {
          return { error: `Container not found: ${args.container}` };
        }
        
        const tail = parseInt(args.tail || '100', 10);
        const logs = await getContainerLogs(container.Id, { tail });
        
        return { logs: logs || '(no logs available)' };
      } catch (error) {
        return { error: `Failed to get logs: ${error}` };
      }
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function createDockerChatAdapter(): ChatAdapter {
  return {
    id: 'docker',
    name: 'Docker Assistant',
    placeholder: 'Ask about your containers and images...',
    tools: dockerTools,

    async executeTool(toolCall: ToolCall): Promise<ToolResult> {
      const args = JSON.parse(toolCall.arguments);
      const data = await executeDocker(toolCall.name, args);
      return {
        id: toolCall.id,
        data,
      };
    },

    buildInstructions(environment: ChatEnvironment): string {
      const env = environment as DockerEnvironment;
      
      let contextInfo = '';
      const parts: string[] = [];
      
      if (env.selectedResourceType) {
        parts.push(`- Currently viewing: ${env.selectedResourceType}`);
      }
      if (env.selectedContainerName) {
        parts.push(`- Currently selected container: ${env.selectedContainerName}`);
      }
      
      if (parts.length > 0) {
        contextInfo = `\n\nThe user is currently viewing:\n${parts.join('\n')}\n\nUse this context to provide more relevant answers.`;
      }

      return `You are a helpful Docker assistant. You can help users understand and manage their Docker containers and images.
When users ask about containers or images, use the available tools to fetch real data from the Docker daemon.
Provide clear, concise explanations and highlight any issues or warnings you find.
Format your responses using markdown for better readability.${contextInfo}`;
    },
  };
}
