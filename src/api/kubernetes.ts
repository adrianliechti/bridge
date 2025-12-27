import type {
  CoreV1Event,
  CoreV1EventList,
  V1APIResource,
  V1NamespaceList,
  V1CustomResourceDefinition,
  V1CustomResourceDefinitionList,
} from '@kubernetes/client-node';
import type { KubernetesObject, KubernetesListObject } from '@kubernetes/client-node';

import { getApiBase } from './kubernetesDiscovery';

export {
  discoverResources,
  getResourceConfig,
  preloadDiscovery,
  getApiBase,
  crdToResourceConfig,
} from './kubernetesDiscovery';

export type {
  V1Namespace,
  V1NamespaceList,
  V1APIResource,
  V1APIResourceList,
  V1APIGroup,
  V1APIGroupList,
  CoreV1Event,
  CoreV1EventList,
  V1CustomResourceDefinition,
  V1CustomResourceDefinitionList,
  V1CustomResourceDefinitionSpec,
  V1CustomResourceDefinitionVersion,
} from '@kubernetes/client-node';

// Base fetch helper for JSON API calls
export async function fetchApi<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

// Fetch all namespaces
export async function getNamespaces(): Promise<V1NamespaceList> {
  return fetchApi<V1NamespaceList>('/api/v1/namespaces');
}

// Fetch all CustomResourceDefinitions from the cluster
export async function getCustomResourceDefinitions(): Promise<V1CustomResourceDefinition[]> {
  const response = await fetchApi<V1CustomResourceDefinitionList>(
    '/apis/apiextensions.k8s.io/v1/customresourcedefinitions'
  );
  return response.items;
}

// Extended KubernetesObject with common spec/status fields for generic resource handling
export interface KubernetesResource extends KubernetesObject {
  spec?: Record<string, unknown>;
  status?: Record<string, unknown>;
}

// Fetch a single resource by name
export async function getResource(
  config: V1APIResource,
  resourceName: string,
  namespace?: string
): Promise<KubernetesResource> {
  const apiBase = getApiBase(config);
  const url =
    config.namespaced && namespace
      ? `${apiBase}/namespaces/${namespace}/${config.name}/${resourceName}`
      : `${apiBase}/${config.name}/${resourceName}`;

  return fetchApi<KubernetesResource>(url);
}

// Update a resource (PUT)
export async function updateResource(
  config: V1APIResource,
  resourceName: string,
  resource: KubernetesResource,
  namespace?: string
): Promise<KubernetesResource> {
  const apiBase = getApiBase(config);
  const url =
    config.namespaced && namespace
      ? `${apiBase}/namespaces/${namespace}/${config.name}/${resourceName}`
      : `${apiBase}/${config.name}/${resourceName}`;

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(resource),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    let message = `API request failed: ${response.status} ${response.statusText}`;
    try {
      const errorJson = JSON.parse(errorBody);
      if (errorJson.message) {
        message = errorJson.message;
      }
    } catch {
      // Use default message
    }
    throw new Error(message);
  }

  return response.json();
}

// Fetch a list of resources (full objects, not Table API)
export async function getResourceList(
  config: V1APIResource,
  namespace?: string
): Promise<KubernetesResource[]> {
  const apiBase = getApiBase(config);
  const url =
    config.namespaced && namespace
      ? `${apiBase}/namespaces/${namespace}/${config.name}`
      : `${apiBase}/${config.name}`;

  const response = await fetchApi<KubernetesListObject<KubernetesResource>>(url);
  return response.items;
}

// Fetch events for a specific resource
export async function getResourceEvents(
  resourceName: string,
  namespace?: string
): Promise<CoreV1Event[]> {
  const fieldSelector = namespace
    ? `involvedObject.name=${resourceName},involvedObject.namespace=${namespace}`
    : `involvedObject.name=${resourceName}`;

  const url = namespace
    ? `/api/v1/namespaces/${namespace}/events?fieldSelector=${encodeURIComponent(fieldSelector)}`
    : `/api/v1/events?fieldSelector=${encodeURIComponent(fieldSelector)}`;

  const response = await fetchApi<CoreV1EventList>(url);

  // Sort by last timestamp (most recent first)
  // Note: timestamps from K8s API are strings, not Date objects
  return response.items.sort((a, b) => {
    const timeA = a.lastTimestamp || a.eventTime || a.metadata?.creationTimestamp || '';
    const timeB = b.lastTimestamp || b.eventTime || b.metadata?.creationTimestamp || '';
    return new Date(timeB as string).getTime() - new Date(timeA as string).getTime();
  });
}
