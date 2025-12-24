// Kubernetes API client for browser
// Base utilities and shared types

import type {
  V1NamespaceList,
  V1CustomResourceDefinition,
  V1CustomResourceDefinitionList,
} from '@kubernetes/client-node';

// Base fetch helper for JSON API calls
export async function fetchApi<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

export async function getNamespaces(): Promise<V1NamespaceList> {
  return fetchApi<V1NamespaceList>('/api/v1/namespaces');
}

// Fetch all CustomResourceDefinitions from the cluster
export async function getCustomResourceDefinitions(): Promise<V1CustomResourceDefinition[]> {
  const response = await fetchApi<V1CustomResourceDefinitionList>('/apis/apiextensions.k8s.io/v1/customresourcedefinitions');
  return response.items;
}

// Re-export discovery API
export {
  discoverResources,
  getResourceConfig,
  preloadDiscovery,
  getApiBase,
} from './kubernetesDiscovery';

// Re-export common types from @kubernetes/client-node
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
