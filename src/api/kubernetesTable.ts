// Kubernetes API client using Table format
// This leverages the native kubectl-style table output from the API

import type { TableResponse } from '../types/table';
import type {
  CoreV1Event,
  CoreV1EventList,
  V1CustomResourceDefinition,
  V1APIResource,
} from '@kubernetes/client-node';
import {
  fetchApi,
  getResourceConfig as getDiscoveredResourceConfig,
  getApiBase,
} from './kubernetes';

// Table format header - this tells Kubernetes to return data in table format
// with column definitions, just like kubectl uses
const TABLE_ACCEPT_HEADER = 'application/json;as=Table;v=v1;g=meta.k8s.io';

async function fetchTable(url: string): Promise<TableResponse> {
  const response = await fetch(url, {
    headers: {
      Accept: TABLE_ACCEPT_HEADER,
    },
  });
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

// Re-export V1APIResource as ResourceConfig for backwards compat
export type { V1APIResource, V1APIResource as ResourceConfig } from '@kubernetes/client-node';

// Get the proper display name (kind) for a resource
export async function getAPIResourceKind(plural: string): Promise<string | undefined> {
  const config = await getDiscoveredResourceConfig(plural);
  return config?.kind;
}

// Re-export CRD types from @kubernetes/client-node
export type {
  V1CustomResourceDefinition,
  V1CustomResourceDefinitionList,
  V1CustomResourceDefinitionSpec,
  V1CustomResourceDefinitionVersion,
} from '@kubernetes/client-node';

// CRDResourceConfig is just an alias for V1APIResource
export type CRDResourceConfig = V1APIResource;

// Convert a CRD to a V1APIResource
export function crdToResourceConfig(crd: V1CustomResourceDefinition): CRDResourceConfig {
  const spec = crd.spec;
  if (!spec) {
    throw new Error('CRD is missing spec');
  }
  // Find the served/storage version (prefer storage, then first served)
  const storageVersion = spec.versions.find((v) => v.storage);
  const servedVersion = spec.versions.find((v) => v.served);
  const version = storageVersion?.name || servedVersion?.name || spec.versions[0]?.name;

  return {
    name: spec.names.plural,
    singularName: spec.names.singular || '',
    namespaced: spec.scope === 'Namespaced',
    group: spec.group,
    version,
    kind: spec.names.kind,
    verbs: ['get', 'list', 'watch', 'create', 'update', 'patch', 'delete'],
    shortNames: spec.names.shortNames,
  };
}

// Get table for a resource (built-in or CRD)
export async function getResourceTable(
  config: V1APIResource,
  namespace?: string
): Promise<TableResponse> {
  const apiBase = getApiBase(config);
  const url = config.namespaced && namespace
    ? `${apiBase}/namespaces/${namespace}/${config.name}`
    : `${apiBase}/${config.name}`;

  return fetchTable(url);
}

// Fetch a single resource by name
export async function getResource(
  config: V1APIResource,
  resourceName: string,
  namespace?: string
): Promise<Record<string, unknown>> {
  const apiBase = getApiBase(config);
  const url = config.namespaced && namespace
    ? `${apiBase}/namespaces/${namespace}/${config.name}/${resourceName}`
    : `${apiBase}/${config.name}/${resourceName}`;

  return fetchApi<Record<string, unknown>>(url);
}

// Re-export CoreV1Event for use in components
export type { CoreV1Event } from '@kubernetes/client-node';

// Fetch events for a specific resource
export async function getResourceEvents(
  resourceName: string,
  namespace?: string
): Promise<CoreV1Event[]> {
  // Build the field selector to filter events by involved object
  const fieldSelector = namespace
    ? `involvedObject.name=${resourceName},involvedObject.namespace=${namespace}`
    : `involvedObject.name=${resourceName}`;
  
  const url = namespace
    ? `/api/v1/namespaces/${namespace}/events?fieldSelector=${encodeURIComponent(fieldSelector)}`
    : `/api/v1/events?fieldSelector=${encodeURIComponent(fieldSelector)}`;

  const response = await fetchApi<CoreV1EventList>(url);
  
  // Sort by last timestamp (most recent first)
  return response.items.sort((a, b) => {
    const timeA = a.lastTimestamp?.toISOString() || a.eventTime || a.metadata?.creationTimestamp?.toISOString() || '';
    const timeB = b.lastTimestamp?.toISOString() || b.eventTime || b.metadata?.creationTimestamp?.toISOString() || '';
    return new Date(timeB).getTime() - new Date(timeA).getTime();
  });
}

// Unified resource selection - can be built-in or CRD
export type ResourceSelection =
  | { type: 'builtin'; kind: string }
  | { type: 'crd'; config: CRDResourceConfig };

export async function getResourceConfigFromSelection(selection: ResourceSelection): Promise<V1APIResource> {
  if (selection.type === 'builtin') {
    const config = await getDiscoveredResourceConfig(selection.kind);
    if (!config) {
      throw new Error(`Unknown resource kind: ${selection.kind}`);
    }
    return config;
  }
  return selection.config;
}

// Helper to create a built-in selection
export function builtinResource(kind: string): ResourceSelection {
  return { type: 'builtin', kind };
}

// Helper to create a CRD selection
export function crdResource(config: CRDResourceConfig): ResourceSelection {
  return { type: 'crd', config };
}

// Get display name for a resource selection
// Uses the name (plural) from the resource config, properly capitalized
export async function getResourceDisplayName(selection: ResourceSelection): Promise<string> {
  if (selection.type === 'builtin') {
    const config = await getDiscoveredResourceConfig(selection.kind);
    if (config) {
      return capitalize(config.name);
    }
    // Fallback: capitalize the kind
    return capitalize(selection.kind);
  }
  // For CRDs, use the name from config
  return capitalize(selection.config.name);
}

// Synchronous version for initial render (fallback only, use async version when possible)
export function getResourceDisplayNameSync(selection: ResourceSelection): string {
  if (selection.type === 'builtin') {
    // Fallback: capitalize the kind
    return capitalize(selection.kind);
  }
  return capitalize(selection.config.name);
}

// Capitalize first letter
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Preload API resource discovery (call on app startup for better UX)
export { preloadDiscovery as preloadAPIResources } from './kubernetes';
