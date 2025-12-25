// Kubernetes-specific chat tools and execution logic
import { getResourceConfig, getApiBase } from './kubernetesDiscovery';
import type { V1APIResource } from '@kubernetes/client-node';
import type { Tool, ToolCall, ToolResult, Message } from './openai';
import { Role, complete } from './openai';

// Kubernetes API tools
export const kubernetesTools: Tool[] = [
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

// Get resource config from discovery API (supports plural, singular, and short names)
async function getResourceConfigForName(resourceName: string): Promise<{ config: V1APIResource; plural: string } | null> {
  const name = resourceName.toLowerCase();
  const config = await getResourceConfig(name);
  if (config) {
    return { config, plural: config.name };
  }
  return null;
}

// Execute Kubernetes tool calls
async function executeKubernetes(
  toolName: string,
  args: Record<string, string>
): Promise<unknown> {
  switch (toolName) {
    case 'list_resources': {
      const result = await getResourceConfigForName(args.resource);
      if (!result) {
        return { error: `Unknown resource type: ${args.resource}` };
      }
      const { config, plural: resourceName } = result;

      const apiBase = getApiBase(config);
      let url: string;
      if (config.namespaced && args.namespace && args.namespace !== 'all') {
        url = `${apiBase}/namespaces/${args.namespace}/${resourceName}`;
      } else {
        url = `${apiBase}/${resourceName}`;
      }

      const response = await fetch(url);
      if (!response.ok) {
        return { error: `Failed to list ${resourceName}: ${response.status} ${response.statusText}` };
      }
      const data = await response.json();
      
      // Return a simplified list with key info
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
      const result = await getResourceConfigForName(args.resource);
      if (!result) {
        return { error: `Unknown resource type: ${args.resource}` };
      }
      const { config, plural: resourceName } = result;

      const apiBase = getApiBase(config);
      let url: string;
      if (config.namespaced && args.namespace) {
        url = `${apiBase}/namespaces/${args.namespace}/${resourceName}/${args.name}`;
      } else {
        url = `${apiBase}/${resourceName}/${args.name}`;
      }

      const response = await fetch(url);
      if (!response.ok) {
        return { error: `Failed to get ${args.resource} ${args.name}: ${response.status} ${response.statusText}` };
      }
      return response.json();
    }

    case 'get_pod_logs': {
      const tailLines = args.tailLines || '100';
      let url = `/api/v1/namespaces/${args.namespace}/pods/${args.name}/log?tailLines=${tailLines}`;
      if (args.container) {
        url += `&container=${args.container}`;
      }

      const response = await fetch(url);
      if (!response.ok) {
        return { error: `Failed to get logs: ${response.status} ${response.statusText}` };
      }
      const logs = await response.text();
      return { logs: logs || '(no logs available)' };
    }

    case 'describe_resource': {
      const result = await getResourceConfigForName(args.resource);
      if (!result) {
        return { error: `Unknown resource type: ${args.resource}` };
      }
      const { config, plural: resourceName } = result;

      // Get the resource details
      const apiBase = getApiBase(config);
      let url: string;
      if (config.namespaced && args.namespace) {
        url = `${apiBase}/namespaces/${args.namespace}/${resourceName}/${args.name}`;
      } else {
        url = `${apiBase}/${resourceName}/${args.name}`;
      }

      const resourceResponse = await fetch(url);
      if (!resourceResponse.ok) {
        return { error: `Failed to get ${args.resource} ${args.name}: ${resourceResponse.status}` };
      }
      const resource = await resourceResponse.json();

      // Get events related to this resource
      const eventsUrl = `/api/v1/namespaces/${args.namespace}/events?fieldSelector=involvedObject.name=${args.name}`;
      const eventsResponse = await fetch(eventsUrl);
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

// Execute a tool call and return the result
export async function executeTool(toolCall: ToolCall): Promise<ToolResult> {
  const args = JSON.parse(toolCall.arguments);
  const data = await executeKubernetes(toolCall.name, args);
  return {
    id: toolCall.id,
    data,
  };
}

// High-level chat function that handles the full conversation loop with tool execution
export async function chat(
  userMessage: string,
  conversationHistory: Message[],
  options?: {
    model?: string;
    instructions?: string;
    onStream?: (delta: string, snapshot: string) => void;
    onToolCall?: (toolName: string, args: Record<string, string>) => void;
  }
): Promise<{ response: Message; history: Message[] }> {
  const model = options?.model || '';
  const instructions =
    options?.instructions ||
    `You are a helpful Kubernetes assistant. You can help users understand and manage their Kubernetes clusters.
When users ask about resources, use the available tools to fetch real data from the cluster.
Provide clear, concise explanations and highlight any issues or warnings you find.
Format your responses using markdown for better readability.`;

  // Add user message to history
  const newHistory: Message[] = [
    ...conversationHistory,
    { role: Role.User, content: userMessage },
  ];

  // Keep processing until we get a final response (no tool calls)
  let currentHistory = newHistory;
  let attempts = 0;
  const maxAttempts = 10; // Prevent infinite loops

  while (attempts < maxAttempts) {
    attempts++;

    const response = await complete(
      model,
      instructions,
      currentHistory,
      kubernetesTools,
      options?.onStream
    );

    // If no tool calls, we're done
    if (!response.toolCalls || response.toolCalls.length === 0) {
      return {
        response,
        history: [...currentHistory, response],
      };
    }

    // Execute tool calls
    currentHistory = [...currentHistory, response];

    for (const toolCall of response.toolCalls) {
      const args = JSON.parse(toolCall.arguments);
      options?.onToolCall?.(toolCall.name, args);

      const result = await executeTool(toolCall);
      currentHistory.push({
        role: Role.Tool,
        content: '',
        toolResult: result,
      });
    }
  }

  // If we hit max attempts, return the last response
  return {
    response: {
      role: Role.Assistant,
      content: 'I apologize, but I encountered an issue processing your request. Please try again.',
    },
    history: currentHistory,
  };
}
