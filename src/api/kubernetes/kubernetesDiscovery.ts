// Kubernetes API discovery
// Discovers all available resources from the cluster

import type {
  V1APIResource,
  V1APIResourceList,
  V1APIGroup,
  V1APIGroupList,
  V1CustomResourceDefinition,
} from '@kubernetes/client-node';

// Discovery cache - per-context, stores resources by unique group/plural key
// aliasCache maps plural, singular, and short names to resources (with priority)
const resourceCacheByContext = new Map<string, Map<string, V1APIResource>>();
const aliasCacheByContext = new Map<string, Map<string, V1APIResource>>();
const discoveryPromiseByContext = new Map<string, Promise<Map<string, V1APIResource>>>();

// Clear discovery cache for a specific context (useful when switching contexts)
export function clearDiscoveryCache(context?: string): void {
  if (context) {
    resourceCacheByContext.delete(context);
    aliasCacheByContext.delete(context);
    discoveryPromiseByContext.delete(context);
  } else {
    resourceCacheByContext.clear();
    aliasCacheByContext.clear();
    discoveryPromiseByContext.clear();
  }
}

// Group priority for alias resolution (lower = higher priority, like kubectl)
// Core API has highest priority, then well-known groups
function getGroupPriority(group: string): number {
  if (group === '') return 0;  // Core API (v1)
  if (group === 'apps') return 1;
  if (group === 'batch') return 2;
  if (group === 'networking.k8s.io') return 3;
  if (group === 'storage.k8s.io') return 4;
  if (group === 'rbac.authorization.k8s.io') return 5;
  if (group.endsWith('.k8s.io')) return 10;  // Other k8s.io groups
  return 100;  // Custom/third-party groups
}

// Build unique key for a resource (group/plural)
function getResourceKey(resource: V1APIResource): string {
  const group = resource.group || '';
  return group ? `${resource.name}.${group}` : resource.name;
}

// Build API base path from group and version
export function getApiBase(resource: V1APIResource): string {
  const group = resource.group || '';
  const version = resource.version || 'v1';
  return group ? `/apis/${group}/${version}` : '/api/v1';
}

// Add a resource to the caches
function addResourceToMap(
  resources: Map<string, V1APIResource>,
  aliases: Map<string, V1APIResource>,
  resource: V1APIResource
): void {
  // Always store by unique key (group/plural)
  const key = getResourceKey(resource);
  resources.set(key, resource);
  
  const resourcePriority = getGroupPriority(resource.group || '');
  
  // Helper to add alias with priority check
  const addAlias = (alias: string) => {
    const existing = aliases.get(alias);
    if (!existing) {
      aliases.set(alias, resource);
    } else {
      // Only overwrite if this resource has higher priority (lower number)
      const existingPriority = getGroupPriority(existing.group || '');
      if (resourcePriority < existingPriority) {
        aliases.set(alias, resource);
      }
    }
  };
  
  // Add aliases by plural, singular, and short names
  addAlias(resource.name);
  
  if (resource.singularName) {
    addAlias(resource.singularName);
  }
  
  if (resource.shortNames) {
    for (const shortName of resource.shortNames) {
      addAlias(shortName);
    }
  }
}

// Helper to fetch API with context
async function fetchApiWithContext<T>(url: string, context: string): Promise<T> {
  const finalUrl = `/contexts/${context}${url}`;
  const response = await fetch(finalUrl);
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

// Discover all API resources from the cluster
export async function discoverResources(context: string): Promise<Map<string, V1APIResource>> {
  // Return cached result if available
  const cachedAliases = aliasCacheByContext.get(context);
  if (cachedAliases) {
    return cachedAliases;
  }

  // Return in-flight promise if discovery is already running
  const existingPromise = discoveryPromiseByContext.get(context);
  if (existingPromise) {
    return existingPromise;
  }

  const discoveryPromise = (async () => {
    const resources = new Map<string, V1APIResource>();
    const aliases = new Map<string, V1APIResource>();

    // Fetch core v1 resources
    try {
      const coreV1 = await fetchApiWithContext<V1APIResourceList>('/api/v1', context);
      for (const resource of coreV1.resources) {
        // Skip subresources (they contain '/')
        if (resource.name.includes('/')) continue;
        
        const enrichedResource = {
          ...resource,
          group: '',
          version: 'v1',
        };
        addResourceToMap(resources, aliases, enrichedResource);
      }
    } catch (e) {
      console.warn('Failed to fetch core v1 resources:', e);
    }

    // Fetch API groups
    try {
      const apiGroups = await fetchApiWithContext<V1APIGroupList>('/apis', context);
      
      // Fetch resources for each group (use preferred version)
      await Promise.all(
        apiGroups.groups.map(async (group: V1APIGroup) => {
          const preferredVersion = group.preferredVersion?.version || group.versions[0]?.version;
          if (!preferredVersion) return;

          const apiBase = `/apis/${group.name}/${preferredVersion}`;
          
          try {
            const resourceList = await fetchApiWithContext<V1APIResourceList>(apiBase, context);
            for (const resource of resourceList.resources) {
              // Skip subresources
              if (resource.name.includes('/')) continue;

              const enrichedResource = {
                ...resource,
                group: resource.group || group.name,
                version: resource.version || preferredVersion,
              };
              addResourceToMap(resources, aliases, enrichedResource);
            }
          } catch (e) {
            console.warn(`Failed to fetch resources for ${apiBase}:`, e);
          }
        })
      );
    } catch (e) {
      console.warn('Failed to fetch API groups:', e);
    }

    resourceCacheByContext.set(context, resources);
    aliasCacheByContext.set(context, aliases);
    discoveryPromiseByContext.delete(context);
    return aliases;
  })();

  discoveryPromiseByContext.set(context, discoveryPromise);
  return discoveryPromise;
}

// Get resource config by plural name
export async function getResourceConfig(context: string, plural: string): Promise<V1APIResource | undefined> {
  const resources = await discoverResources(context);
  return resources.get(plural);
}

// Get resource config by fully qualified name (e.g., "pods.metrics.k8s.io")
export async function getResourceConfigByQualifiedName(context: string, name: string): Promise<V1APIResource | undefined> {
  await discoverResources(context); // Ensure discovery is complete
  return resourceCacheByContext.get(context)?.get(name);
}

// Get resource config by kind name
export async function getResourceConfigByKind(context: string, kind: string, apiVersion?: string): Promise<V1APIResource | undefined> {
  const resources = await discoverResources(context);
  
  // Parse apiVersion to get group (e.g., "apps/v1" -> "apps", "v1" -> "")
  let targetGroup = '';
  if (apiVersion && apiVersion.includes('/')) {
    targetGroup = apiVersion.split('/')[0];
  }
  
  // Search through all resources to find matching kind
  for (const resource of resources.values()) {
    if (resource.kind === kind) {
      // If apiVersion specified, match the group
      if (apiVersion) {
        const resourceGroup = resource.group || '';
        if (resourceGroup === targetGroup) {
          return resource;
        }
      } else {
        // No apiVersion specified, return first match
        return resource;
      }
    }
  }
  
  // If no exact group match found but we have apiVersion, try without group matching
  if (apiVersion) {
    for (const resource of resources.values()) {
      if (resource.kind === kind) {
        return resource;
      }
    }
  }
  
  return undefined;
}

// Preload discovery for a context (call on app startup or context switch)
export function preloadDiscovery(context: string): void {
  discoverResources(context).catch(console.error);
}

// Convert a CRD to a V1APIResource
export function crdToResourceConfig(crd: V1CustomResourceDefinition): V1APIResource {
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
