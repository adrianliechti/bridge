// Kubernetes chat adapter with TanStack AI tools
import { toolDefinition } from '@tanstack/ai';
import { clientTools } from '@tanstack/ai-client';
import { z } from 'zod';
import { getResourceConfig, getApiBase } from '../../api/kubernetes/kubernetesDiscovery';
import type { V1APIResource } from '@kubernetes/client-node';
import type { ChatEnvironment } from '../../types/chat';

export interface KubernetesEnvironment extends ChatEnvironment {
  currentContext: string;
  currentNamespace?: string;
  selectedResourceKind?: string;
  selectedResourceName?: string;
}

// Zod schemas for tool inputs
const listResourcesSchema = z.object({
  resource: z.string().describe('The type of resource to list (e.g., pods, deployments, services, configmaps, secrets, ingresses, gateways, httproutes, grpcroutes, tcproutes, udproutes, tlsroutes, jobs, cronjobs, daemonsets, statefulsets, replicasets, nodes, namespaces, persistentvolumes, persistentvolumeclaims, events)'),
  namespace: z.string().optional().describe('The namespace to list resources from. Use "all" for all namespaces, or omit for cluster-scoped resources'),
});

const getResourceSchema = z.object({
  resource: z.string().describe('The type of resource (e.g., pod, deployment, service)'),
  name: z.string().describe('The name of the resource'),
  namespace: z.string().optional().describe('The namespace of the resource (required for namespaced resources)'),
});

const getPodLogsSchema = z.object({
  name: z.string().describe('The name of the pod'),
  namespace: z.string().describe('The namespace of the pod'),
  container: z.string().optional().describe('The container name (optional, defaults to first container)'),
  tailLines: z.string().optional().describe('Number of lines to return from the end of the logs (default: 100)'),
});

const describeResourceSchema = z.object({
  resource: z.string().describe('The type of resource (e.g., pod, deployment, service)'),
  name: z.string().describe('The name of the resource'),
  namespace: z.string().describe('The namespace of the resource'),
});

// Tool definitions with Zod schemas
const listResourcesDef = toolDefinition({
  name: 'list_resources',
  description: 'List Kubernetes resources of a specific type in a namespace or cluster-wide',
  inputSchema: listResourcesSchema,
});

const getResourceDef = toolDefinition({
  name: 'get_resource',
  description: 'Get detailed information about a specific Kubernetes resource',
  inputSchema: getResourceSchema,
});

const getPodLogsDef = toolDefinition({
  name: 'get_pod_logs',
  description: 'Get logs from a specific pod',
  inputSchema: getPodLogsSchema,
});

const describeResourceDef = toolDefinition({
  name: 'describe_resource',
  description: 'Get events and status conditions for a Kubernetes resource',
  inputSchema: describeResourceSchema,
});

// Get resource config from discovery API
async function getResourceConfigForName(context: string, resourceName: string): Promise<{ config: V1APIResource; plural: string } | null> {
  const name = resourceName.toLowerCase();
  const config = await getResourceConfig(context, name);
  if (config) {
    return { config, plural: config.name };
  }
  return null;
}

// Type aliases for tool inputs
type ListResourcesInput = z.infer<typeof listResourcesSchema>;
type GetResourceInput = z.infer<typeof getResourceSchema>;
type GetPodLogsInput = z.infer<typeof getPodLogsSchema>;
type DescribeResourceInput = z.infer<typeof describeResourceSchema>;

// Create client tool implementations
export function createKubernetesTools(environment: KubernetesEnvironment) {
  const context = environment.currentContext;

  const listResources = listResourcesDef.client(async (args: unknown) => {
    const input = args as ListResourcesInput;
    const result = await getResourceConfigForName(context, input.resource);
    if (!result) {
      return { error: `Unknown resource type: ${input.resource}` };
    }
    const { config, plural: resourceName } = result;

    const apiBase = getApiBase(config);
    let path: string;
    if (config.namespaced && input.namespace && input.namespace !== 'all') {
      path = `${apiBase}/namespaces/${input.namespace}/${resourceName}`;
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
  });

  const getResource = getResourceDef.client(async (args: unknown) => {
    const input = args as GetResourceInput;
    const result = await getResourceConfigForName(context, input.resource);
    if (!result) {
      return { error: `Unknown resource type: ${input.resource}` };
    }
    const { config, plural: resourceName } = result;

    const apiBase = getApiBase(config);
    let path: string;
    if (config.namespaced && input.namespace) {
      path = `${apiBase}/namespaces/${input.namespace}/${resourceName}/${input.name}`;
    } else {
      path = `${apiBase}/${resourceName}/${input.name}`;
    }

    const response = await fetch(`/contexts/${context}${path}`);
    if (!response.ok) {
      return { error: `Failed to get ${input.resource} ${input.name}: ${response.status} ${response.statusText}` };
    }
    return response.json();
  });

  const getPodLogs = getPodLogsDef.client(async (args: unknown) => {
    const input = args as GetPodLogsInput;
    const tailLines = input.tailLines || '100';
    let path = `/api/v1/namespaces/${input.namespace}/pods/${input.name}/log?tailLines=${tailLines}`;
    if (input.container) {
      path += `&container=${input.container}`;
    }

    const response = await fetch(`/contexts/${context}${path}`);
    if (!response.ok) {
      return { error: `Failed to get logs: ${response.status} ${response.statusText}` };
    }
    const logs = await response.text();
    return { logs: logs || '(no logs available)' };
  });

  const describeResource = describeResourceDef.client(async (args: unknown) => {
    const input = args as DescribeResourceInput;
    const result = await getResourceConfigForName(context, input.resource);
    if (!result) {
      return { error: `Unknown resource type: ${input.resource}` };
    }
    const { config, plural: resourceName } = result;

    const apiBase = getApiBase(config);
    let path: string;
    if (config.namespaced && input.namespace) {
      path = `${apiBase}/namespaces/${input.namespace}/${resourceName}/${input.name}`;
    } else {
      path = `${apiBase}/${resourceName}/${input.name}`;
    }

    const resourceResponse = await fetch(`/contexts/${context}${path}`);
    if (!resourceResponse.ok) {
      return { error: `Failed to get ${input.resource} ${input.name}: ${resourceResponse.status}` };
    }
    const resource = await resourceResponse.json();

    // Get events related to this resource
    const eventsPath = `/api/v1/namespaces/${input.namespace}/events?fieldSelector=involvedObject.name=${input.name}`;
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
  });

  return clientTools(listResources, getResource, getPodLogs, describeResource);
}

// Build system instructions based on environment
export function buildKubernetesInstructions(environment: KubernetesEnvironment): string {
  let contextInfo = '';
  const parts: string[] = [];

  if (environment.currentNamespace) {
    parts.push(`- Current namespace: ${environment.currentNamespace}`);
  }
  if (environment.selectedResourceKind) {
    parts.push(`- Currently viewing resource type: ${environment.selectedResourceKind}`);
  }
  if (environment.selectedResourceName) {
    parts.push(`- Currently selected resource: ${environment.selectedResourceName}`);
  }

  if (parts.length > 0) {
    contextInfo = `\n\nThe user is currently viewing:\n${parts.join('\n')}\n\nUse this context to provide more relevant answers. When the user asks about resources without specifying a namespace, use the current namespace.`;
  }

  return `You are a helpful Kubernetes assistant. You can help users understand and manage their Kubernetes clusters.
When users ask about resources, use the available tools to fetch real data from the cluster.
Provide clear, concise explanations and highlight any issues or warnings you find.
Format your responses using markdown for better readability.${contextInfo}`;
}

// Adapter metadata
export const kubernetesAdapterConfig = {
  id: 'kubernetes',
  name: 'Kubernetes Assistant',
  placeholder: 'Ask about your Kubernetes resources...',
};
