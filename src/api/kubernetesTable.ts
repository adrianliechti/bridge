// Kubernetes API client using Table format
// This leverages the native kubectl-style table output from the API

import type { TableResponse } from '../types/table';

// API paths
const CORE_V1 = '/api/v1';
const APPS_V1 = '/apis/apps/v1';
const BATCH_V1 = '/apis/batch/v1';
const NETWORKING_V1 = '/apis/networking.k8s.io/v1';

// Table format header - this tells Kubernetes to return data in table format
// with column definitions, just like kubectl uses
const TABLE_ACCEPT_HEADER = 'application/json;as=Table;v=v1;g=meta.k8s.io';

// API Resource types from discovery endpoints
interface APIResource {
  name: string;
  singularName: string;
  namespaced: boolean;
  kind: string; // Proper casing like "ReplicaSet", "DaemonSet", etc.
  verbs: string[];
  shortNames?: string[];
}

interface APIResourceList {
  groupVersion: string;
  resources: APIResource[];
}

// Cache for API resource discovery
let apiResourceCache: Map<string, APIResource> | null = null;

async function fetchApi<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

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

// Built-in resource types
export type BuiltInResourceKind =
  | 'pods'
  | 'services'
  | 'deployments'
  | 'replicasets'
  | 'daemonsets'
  | 'statefulsets'
  | 'jobs'
  | 'cronjobs'
  | 'configmaps'
  | 'secrets'
  | 'ingresses'
  | 'namespaces'
  | 'nodes'
  | 'persistentvolumes'
  | 'persistentvolumeclaims'
  | 'events';

export interface ResourceConfig {
  apiBase: string;
  namespaced: boolean;
  plural: string;
}

const builtInResourceConfigs: Record<BuiltInResourceKind, ResourceConfig> = {
  // Core V1
  pods: { apiBase: CORE_V1, namespaced: true, plural: 'pods' },
  services: { apiBase: CORE_V1, namespaced: true, plural: 'services' },
  configmaps: { apiBase: CORE_V1, namespaced: true, plural: 'configmaps' },
  secrets: { apiBase: CORE_V1, namespaced: true, plural: 'secrets' },
  namespaces: { apiBase: CORE_V1, namespaced: false, plural: 'namespaces' },
  nodes: { apiBase: CORE_V1, namespaced: false, plural: 'nodes' },
  persistentvolumes: { apiBase: CORE_V1, namespaced: false, plural: 'persistentvolumes' },
  persistentvolumeclaims: { apiBase: CORE_V1, namespaced: true, plural: 'persistentvolumeclaims' },
  events: { apiBase: CORE_V1, namespaced: true, plural: 'events' },
  // Apps V1
  deployments: { apiBase: APPS_V1, namespaced: true, plural: 'deployments' },
  replicasets: { apiBase: APPS_V1, namespaced: true, plural: 'replicasets' },
  daemonsets: { apiBase: APPS_V1, namespaced: true, plural: 'daemonsets' },
  statefulsets: { apiBase: APPS_V1, namespaced: true, plural: 'statefulsets' },
  // Batch V1
  jobs: { apiBase: BATCH_V1, namespaced: true, plural: 'jobs' },
  cronjobs: { apiBase: BATCH_V1, namespaced: true, plural: 'cronjobs' },
  // Networking V1
  ingresses: { apiBase: NETWORKING_V1, namespaced: true, plural: 'ingresses' },
};

export function getBuiltInResourceConfig(kind: BuiltInResourceKind): ResourceConfig {
  return builtInResourceConfigs[kind];
}

export function isBuiltInResource(kind: string): kind is BuiltInResourceKind {
  return kind in builtInResourceConfigs;
}

// Fetch API resources from discovery endpoints to get proper kind names
async function fetchAPIResources(): Promise<Map<string, APIResource>> {
  if (apiResourceCache) {
    return apiResourceCache;
  }

  const apiEndpoints = [CORE_V1, APPS_V1, BATCH_V1, NETWORKING_V1];
  const resourceMap = new Map<string, APIResource>();

  await Promise.all(
    apiEndpoints.map(async (endpoint) => {
      try {
        const response = await fetchApi<APIResourceList>(endpoint);
        for (const resource of response.resources) {
          // Skip subresources (they contain '/')
          if (!resource.name.includes('/')) {
            resourceMap.set(resource.name, resource);
          }
        }
      } catch (e) {
        console.warn(`Failed to fetch API resources from ${endpoint}:`, e);
      }
    })
  );

  apiResourceCache = resourceMap;
  return resourceMap;
}

// Get the proper display name (kind) for a built-in resource from the API
export async function getAPIResourceKind(plural: string): Promise<string | undefined> {
  const resources = await fetchAPIResources();
  return resources.get(plural)?.kind;
}

// CRD types
export interface CRDSpec {
  group: string;
  names: {
    plural: string;
    singular: string;
    kind: string;
    shortNames?: string[];
  };
  scope: 'Namespaced' | 'Cluster';
  versions: {
    name: string;
    served: boolean;
    storage: boolean;
  }[];
}

export interface CRD {
  metadata: {
    name: string;
    uid: string;
  };
  spec: CRDSpec;
}

export interface CRDList {
  items: CRD[];
}

export interface CRDResourceConfig extends ResourceConfig {
  group: string;
  version: string;
  kind: string;
  shortNames?: string[];
}

// Fetch all CRDs from the cluster
export async function getCRDs(): Promise<CRD[]> {
  const response = await fetchApi<CRDList>(
    '/apis/apiextensions.k8s.io/v1/customresourcedefinitions'
  );
  return response.items;
}

// Convert a CRD to a ResourceConfig
export function crdToResourceConfig(crd: CRD): CRDResourceConfig {
  // Find the served/storage version (prefer storage, then first served)
  const storageVersion = crd.spec.versions.find((v) => v.storage);
  const servedVersion = crd.spec.versions.find((v) => v.served);
  const version = storageVersion?.name || servedVersion?.name || crd.spec.versions[0]?.name;

  return {
    apiBase: `/apis/${crd.spec.group}/${version}`,
    namespaced: crd.spec.scope === 'Namespaced',
    plural: crd.spec.names.plural,
    group: crd.spec.group,
    version,
    kind: crd.spec.names.kind,
    shortNames: crd.spec.names.shortNames,
  };
}

// Get table for a resource (built-in or CRD)
export async function getResourceTable(
  config: ResourceConfig,
  namespace?: string
): Promise<TableResponse> {
  let url: string;

  if (config.namespaced && namespace) {
    url = `${config.apiBase}/namespaces/${namespace}/${config.plural}`;
  } else {
    url = `${config.apiBase}/${config.plural}`;
  }

  return fetchTable(url);
}

// Legacy function for built-in resources by kind name
export async function getBuiltInResourceTable(
  kind: BuiltInResourceKind,
  namespace?: string
): Promise<TableResponse> {
  const config = builtInResourceConfigs[kind];
  return getResourceTable(config, namespace);
}

// Unified resource selection - can be built-in or CRD
export type ResourceSelection =
  | { type: 'builtin'; kind: BuiltInResourceKind }
  | { type: 'crd'; config: CRDResourceConfig };

export function getResourceConfigFromSelection(selection: ResourceSelection): ResourceConfig {
  if (selection.type === 'builtin') {
    return builtInResourceConfigs[selection.kind];
  }
  return selection.config;
}

// Helper to create a built-in selection
export function builtinResource(kind: BuiltInResourceKind): ResourceSelection {
  return { type: 'builtin', kind };
}

// Helper to create a CRD selection
export function crdResource(config: CRDResourceConfig): ResourceSelection {
  return { type: 'crd', config };
}

// Get display name for a resource selection
// For built-in resources, use cached API discovery data if available, otherwise fallback
export async function getResourceDisplayName(selection: ResourceSelection): Promise<string> {
  if (selection.type === 'builtin') {
    // Try to get proper kind from API discovery
    const kind = await getAPIResourceKind(selection.kind);
    if (kind) {
      // Pluralize the kind name for display
      return pluralize(kind);
    }
    // Fallback: capitalize first letter
    return selection.kind.charAt(0).toUpperCase() + selection.kind.slice(1);
  }
  // For CRDs, the kind is already properly cased
  return pluralize(selection.config.kind);
}

// Synchronous version for initial render (uses cache if available)
export function getResourceDisplayNameSync(selection: ResourceSelection): string {
  if (selection.type === 'builtin') {
    const cached = apiResourceCache?.get(selection.kind);
    if (cached) {
      return pluralize(cached.kind);
    }
    // Fallback: capitalize first letter
    return selection.kind.charAt(0).toUpperCase() + selection.kind.slice(1);
  }
  return pluralize(selection.config.kind);
}

// Simple pluralization for display names
function pluralize(kind: string): string {
  // Handle common special cases
  if (kind.endsWith('s')) return kind + 'es'; // Ingress -> Ingresses
  if (kind.endsWith('y')) return kind.slice(0, -1) + 'ies'; // Doesn't apply to current resources
  return kind + 's';
}

// Preload API resource discovery (call on app startup for better UX)
export function preloadAPIResources(): void {
  fetchAPIResources().catch(console.error);
}

// For backwards compatibility
export type ResourceKind = BuiltInResourceKind;
export function getResourceConfig(kind: BuiltInResourceKind): ResourceConfig {
  return builtInResourceConfigs[kind];
}
