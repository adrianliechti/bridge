// Kubernetes chat adapter
import { getResourceConfig, getApiBase } from '../../api/kubernetes/kubernetesDiscovery';
import type { V1APIResource } from '@kubernetes/client-node';
import type { Tool, ToolCall, ToolResult } from '../../api/openai/openai';
import type { ChatAdapter, ChatEnvironment } from '../../types/chat';

export interface KubernetesEnvironment extends ChatEnvironment {
  currentContext: string;
  currentNamespace?: string;
  selectedResourceKind?: string;
  selectedResourceName?: string;
}

// Kubernetes API tools
const kubernetesTools: Tool[] = [
  {
    name: 'list_resources',
    description: 'List Kubernetes resources of a specific type in a namespace or cluster-wide',
    parameters: {
      type: 'object',
      properties: {
        resource: {
          type: 'string',
          description: 'The type of resource to list (e.g., pods, deployments, services, configmaps, secrets, ingresses, gateways, httproutes, grpcroutes, tcproutes, udproutes, tlsroutes, jobs, cronjobs, daemonsets, statefulsets, replicasets, nodes, namespaces, persistentvolumes, persistentvolumeclaims, events)',
        },
        namespace: {
          type: 'string',
          description: 'The namespace to list resources from. Use "all" for all namespaces, or omit for cluster-scoped resources',
        },
      },
      required: ['resource'],
    },
  },
  {
    name: 'get_resource',
    description: 'Get detailed information about a specific Kubernetes resource',
    parameters: {
      type: 'object',
      properties: {
        resource: {
          type: 'string',
          description: 'The type of resource (e.g., pod, deployment, service)',
        },
        name: {
          type: 'string',
          description: 'The name of the resource',
        },
        namespace: {
          type: 'string',
          description: 'The namespace of the resource (required for namespaced resources)',
        },
      },
      required: ['resource', 'name'],
    },
  },
  {
    name: 'get_pod_logs',
    description: 'Get logs from a specific pod',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'The name of the pod',
        },
        namespace: {
          type: 'string',
          description: 'The namespace of the pod',
        },
        container: {
          type: 'string',
          description: 'The container name (optional, defaults to first container)',
        },
        tailLines: {
          type: 'string',
          description: 'Number of lines to return from the end of the logs (default: 100)',
        },
      },
      required: ['name', 'namespace'],
    },
  },
  {
    name: 'describe_resource',
    description: 'Get events and status conditions for a Kubernetes resource',
    parameters: {
      type: 'object',
      properties: {
        resource: {
          type: 'string',
          description: 'The type of resource (e.g., pod, deployment, service)',
        },
        name: {
          type: 'string',
          description: 'The name of the resource',
        },
        namespace: {
          type: 'string',
          description: 'The namespace of the resource',
        },
      },
      required: ['resource', 'name', 'namespace'],
    },
  },
];

// Get resource config from discovery API
async function getResourceConfigForName(context: string, resourceName: string): Promise<{ config: V1APIResource; plural: string } | null> {
  const name = resourceName.toLowerCase();
  const config = await getResourceConfig(context, name);
  if (config) {
    return { config, plural: config.name };
  }
  return null;
}

// Execute Kubernetes tool calls
async function executeKubernetes(
  context: string,
  toolName: string,
  args: Record<string, string>
): Promise<unknown> {
  switch (toolName) {
    case 'list_resources': {
      const result = await getResourceConfigForName(context, args.resource);
      if (!result) {
        return { error: `Unknown resource type: ${args.resource}` };
      }
      const { config, plural: resourceName } = result;

      const apiBase = getApiBase(config);
      let path: string;
      if (config.namespaced && args.namespace && args.namespace !== 'all') {
        path = `${apiBase}/namespaces/${args.namespace}/${resourceName}`;
      } else {
        path = `${apiBase}/${resourceName}`;
      }

      const response = await fetch(`/contexts/${context}${path}`);
      if (!response.ok) {
        return { error: `Failed to list ${resourceName}: ${response.status} ${response.statusText}` };
      }
      const data = await response.json();
      
      return {
        kind: data.kind,
        items: data.items?.map((item: { metadata: { name: string; namespace?: string; creationTimestamp: string }; status?: unknown }) => ({
          name: item.metadata?.name,
          namespace: item.metadata?.namespace,
          createdAt: item.metadata?.creationTimestamp,
          status: item.status,
        })) || [],
      };
    }

    case 'get_resource': {
      const result = await getResourceConfigForName(context, args.resource);
      if (!result) {
        return { error: `Unknown resource type: ${args.resource}` };
      }
      const { config, plural: resourceName } = result;

      const apiBase = getApiBase(config);
      let path: string;
      if (config.namespaced && args.namespace) {
        path = `${apiBase}/namespaces/${args.namespace}/${resourceName}/${args.name}`;
      } else {
        path = `${apiBase}/${resourceName}/${args.name}`;
      }

      const response = await fetch(`/contexts/${context}${path}`);
      if (!response.ok) {
        return { error: `Failed to get ${args.resource} ${args.name}: ${response.status} ${response.statusText}` };
      }
      return response.json();
    }

    case 'get_pod_logs': {
      const tailLines = args.tailLines || '100';
      let path = `/api/v1/namespaces/${args.namespace}/pods/${args.name}/log?tailLines=${tailLines}`;
      if (args.container) {
        path += `&container=${args.container}`;
      }

      const response = await fetch(`/contexts/${context}${path}`);
      if (!response.ok) {
        return { error: `Failed to get logs: ${response.status} ${response.statusText}` };
      }
      const logs = await response.text();
      return { logs: logs || '(no logs available)' };
    }

    case 'describe_resource': {
      const result = await getResourceConfigForName(context, args.resource);
      if (!result) {
        return { error: `Unknown resource type: ${args.resource}` };
      }
      const { config, plural: resourceName } = result;

      const apiBase = getApiBase(config);
      let path: string;
      if (config.namespaced && args.namespace) {
        path = `${apiBase}/namespaces/${args.namespace}/${resourceName}/${args.name}`;
      } else {
        path = `${apiBase}/${resourceName}/${args.name}`;
      }

      const resourceResponse = await fetch(`/contexts/${context}${path}`);
      if (!resourceResponse.ok) {
        return { error: `Failed to get ${args.resource} ${args.name}: ${resourceResponse.status}` };
      }
      const resource = await resourceResponse.json();

      // Get events related to this resource
      const eventsPath = `/api/v1/namespaces/${args.namespace}/events?fieldSelector=involvedObject.name=${args.name}`;
      const eventsResponse = await fetch(`/contexts/${context}${eventsPath}`);
      let events: unknown[] = [];
      if (eventsResponse.ok) {
        const eventsData = await eventsResponse.json();
        events = eventsData.items?.map((e: { type: string; reason: string; message: string; lastTimestamp: string }) => ({
          type: e.type,
          reason: e.reason,
          message: e.message,
          lastTimestamp: e.lastTimestamp,
        })) || [];
      }

      return {
        metadata: resource.metadata,
        spec: resource.spec,
        status: resource.status,
        events,
      };
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

export function createKubernetesChatAdapter(): ChatAdapter {
  return {
    id: 'kubernetes',
    name: 'Kubernetes Assistant',
    placeholder: 'Ask about your Kubernetes resources...',
    tools: kubernetesTools,

    async executeTool(toolCall: ToolCall, environment: ChatEnvironment): Promise<ToolResult> {
      const env = environment as KubernetesEnvironment;
      const args = JSON.parse(toolCall.arguments);
      const data = await executeKubernetes(env.currentContext, toolCall.name, args);
      return {
        id: toolCall.id,
        data,
      };
    },

    buildInstructions(environment: ChatEnvironment): string {
      const env = environment as KubernetesEnvironment;
      
      let contextInfo = '';
      const parts: string[] = [];
      
      if (env.currentNamespace) {
        parts.push(`- Current namespace: ${env.currentNamespace}`);
      }
      if (env.selectedResourceKind) {
        parts.push(`- Currently viewing resource type: ${env.selectedResourceKind}`);
      }
      if (env.selectedResourceName) {
        parts.push(`- Currently selected resource: ${env.selectedResourceName}`);
      }
      
      if (parts.length > 0) {
        contextInfo = `\n\nThe user is currently viewing:\n${parts.join('\n')}\n\nUse this context to provide more relevant answers. When the user asks about resources without specifying a namespace, use the current namespace.`;
      }

      return `You are a helpful Kubernetes assistant. You can help users understand and manage their Kubernetes clusters.
When users ask about resources, use the available tools to fetch real data from the cluster.
Provide clear, concise explanations and highlight any issues or warnings you find.
Format your responses using markdown for better readability.${contextInfo}`;
    },
  };
}
