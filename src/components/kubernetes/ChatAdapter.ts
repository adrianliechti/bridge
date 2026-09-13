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
  resource: z
    .string()
    .describe(
      'The type of resource to list (e.g., pods, deployments, services, configmaps, secrets, ingresses, gateways, httproutes, grpcroutes, tcproutes, udproutes, tlsroutes, jobs, cronjobs, daemonsets, statefulsets, replicasets, nodes, namespaces, persistentvolumes, persistentvolumeclaims, events)',
    ),
  namespace: z
    .string()
    .optional()
    .describe(
      'The namespace to list resources from. Use "all" for all namespaces, or omit for cluster-scoped resources',
    ),
});

const getResourceSchema = z.object({
  resource: z.string().describe('The type of resource (e.g., pod, deployment, service)'),
  name: z.string().describe('The name of the resource'),
  namespace: z
    .string()
    .optional()
    .describe('The namespace of the resource (required for namespaced resources)'),
});

const getPodLogsSchema = z.object({
  name: z.string().describe('The name of the pod'),
  namespace: z.string().describe('The namespace of the pod'),
  container: z
    .string()
    .optional()
    .describe('The container name (optional, defaults to first container)'),
  tailLines: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Number of lines to return from the end of the logs (default: 100)'),
});

const describeResourceSchema = z.object({
  resource: z.string().describe('The type of resource (e.g., pod, deployment, service)'),
  name: z.string().describe('The name of the resource'),
  namespace: z
    .string()
    .optional()
    .describe('The namespace of the resource (omit for cluster-scoped resources)'),
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

// Build the API path for a single resource, honoring namespacing
function resourcePath(config: V1APIResource, name: string, namespace?: string): string {
  const apiBase = getApiBase(config);
  return config.namespaced && namespace
    ? `${apiBase}/namespaces/${encodeURIComponent(namespace)}/${config.name}/${encodeURIComponent(name)}`
    : `${apiBase}/${config.name}/${encodeURIComponent(name)}`;
}

type SlimmableResource = {
  metadata?: { managedFields?: unknown; annotations?: Record<string, string> };
  spec?: unknown;
  status?: unknown;
};

// managedFields and the last-applied annotation are large and useless to the model
function slimResource<T extends SlimmableResource>(resource: T): T {
  if (resource.metadata) {
    delete resource.metadata.managedFields;
    delete resource.metadata.annotations?.['kubectl.kubernetes.io/last-applied-configuration'];
  }
  return resource;
}

// Create client tool implementations
export function createKubernetesTools(environment: KubernetesEnvironment) {
  const context = environment.currentContext;

  const listResources = listResourcesDef.client(async ({ resource, namespace }) => {
    const config = await getResourceConfig(context, resource.toLowerCase());
    if (!config) {
      return { error: `Unknown resource type: ${resource}` };
    }

    const apiBase = getApiBase(config);
    const path =
      config.namespaced && namespace && namespace !== 'all'
        ? `${apiBase}/namespaces/${encodeURIComponent(namespace)}/${config.name}`
        : `${apiBase}/${config.name}`;

    const response = await fetch(`/contexts/${context}${path}`);
    if (!response.ok) {
      return { error: `Failed to list ${config.name}: ${response.status} ${response.statusText}` };
    }
    const data = await response.json();

    return {
      kind: data.kind,
      items:
        data.items?.map(
          (item: {
            metadata: { name: string; namespace?: string; creationTimestamp: string };
            status?: unknown;
          }) => ({
            name: item.metadata?.name,
            namespace: item.metadata?.namespace,
            createdAt: item.metadata?.creationTimestamp,
            status: item.status,
          }),
        ) || [],
    };
  });

  const getResource = getResourceDef.client(async ({ resource, name, namespace }) => {
    const config = await getResourceConfig(context, resource.toLowerCase());
    if (!config) {
      return { error: `Unknown resource type: ${resource}` };
    }

    const response = await fetch(`/contexts/${context}${resourcePath(config, name, namespace)}`);
    if (!response.ok) {
      return {
        error: `Failed to get ${resource} ${name}: ${response.status} ${response.statusText}`,
      };
    }
    return slimResource((await response.json()) as SlimmableResource);
  });

  const getPodLogs = getPodLogsDef.client(async ({ name, namespace, container, tailLines }) => {
    const params = new URLSearchParams({ tailLines: String(tailLines ?? 100) });
    if (container) {
      params.set('container', container);
    }
    const path = `/api/v1/namespaces/${encodeURIComponent(namespace)}/pods/${encodeURIComponent(name)}/log?${params}`;

    const response = await fetch(`/contexts/${context}${path}`);
    if (!response.ok) {
      return { error: `Failed to get logs: ${response.status} ${response.statusText}` };
    }
    const logs = await response.text();
    return { logs: logs || '(no logs available)' };
  });

  const describeResource = describeResourceDef.client(async ({ resource, name, namespace }) => {
    const config = await getResourceConfig(context, resource.toLowerCase());
    if (!config) {
      return { error: `Unknown resource type: ${resource}` };
    }

    const resourceResponse = await fetch(
      `/contexts/${context}${resourcePath(config, name, namespace)}`,
    );
    if (!resourceResponse.ok) {
      return { error: `Failed to get ${resource} ${name}: ${resourceResponse.status}` };
    }
    const detail = slimResource((await resourceResponse.json()) as SlimmableResource);

    // Get events related to this resource; the kind filter avoids picking up
    // events for same-named resources of other kinds
    const fieldSelector = [
      `involvedObject.name=${name}`,
      ...(config.kind ? [`involvedObject.kind=${config.kind}`] : []),
    ].join(',');
    const eventsPath =
      config.namespaced && namespace
        ? `/api/v1/namespaces/${encodeURIComponent(namespace)}/events`
        : '/api/v1/events';
    const eventsResponse = await fetch(
      `/contexts/${context}${eventsPath}?fieldSelector=${encodeURIComponent(fieldSelector)}`,
    );
    let events: unknown[] = [];
    if (eventsResponse.ok) {
      const eventsData = await eventsResponse.json();
      events =
        eventsData.items?.map(
          (e: { type: string; reason: string; message: string; lastTimestamp: string }) => ({
            type: e.type,
            reason: e.reason,
            message: e.message,
            lastTimestamp: e.lastTimestamp,
          }),
        ) || [];
    }

    return {
      metadata: detail.metadata,
      spec: detail.spec,
      status: detail.status,
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
