// Kubernetes API discovery
// Discovers all available resources from the cluster

import type {
  V1APIResource,
  V1APIResourceList,
  V1APIGroup,
  V1APIGroupList,
  V1CustomResourceDefinition,
} from '@kubernetes/client-node';
import { fetchApi } from './kubernetes';

// Discovery cache - maps plural, singular, and short names to resource config
let discoveryCache: Map<string, V1APIResource> | null = null;
let discoveryPromise: Promise<Map<string, V1APIResource>> | null = null;

// Build API base path from group and version
export function getApiBase(resource: V1APIResource): string {
  const group = resource.group || '';
  const version = resource.version || 'v1';
  return group ? `/apis/${group}/${version}` : '/api/v1';
}

// Add a resource to the map with all its name variations
function addResourceToMap(map: Map<string, V1APIResource>, resource: V1APIResource): void {
  // Add by plural name (primary key)
  map.set(resource.name, resource);
  
  // Add by singular name if available
  if (resource.singularName) {
    map.set(resource.singularName, resource);
  }
  
  // Add by short names if available
  if (resource.shortNames) {
    for (const shortName of resource.shortNames) {
      map.set(shortName, resource);
    }
  }
}

// Discover all API resources from the cluster
export async function discoverResources(): Promise<Map<string, V1APIResource>> {
  // Return cached result if available
  if (discoveryCache) {
    return discoveryCache;
  }

  // Return in-flight promise if discovery is already running
  if (discoveryPromise) {
    return discoveryPromise;
  }

  discoveryPromise = (async () => {
    const resourceMap = new Map<string, V1APIResource>();

    // Fetch core v1 resources
    try {
      const coreV1 = await fetchApi<V1APIResourceList>('/api/v1');
      for (const resource of coreV1.resources) {
        // Skip subresources (they contain '/')
        if (resource.name.includes('/')) continue;
        
        const enrichedResource = {
          ...resource,
          group: '',
          version: 'v1',
        };
        addResourceToMap(resourceMap, enrichedResource);
      }
    } catch (e) {
      console.warn('Failed to fetch core v1 resources:', e);
    }

    // Fetch API groups
    try {
      const apiGroups = await fetchApi<V1APIGroupList>('/apis');
      
      // Fetch resources for each group (use preferred version)
      await Promise.all(
        apiGroups.groups.map(async (group: V1APIGroup) => {
          const preferredVersion = group.preferredVersion?.version || group.versions[0]?.version;
          if (!preferredVersion) return;

          const apiBase = `/apis/${group.name}/${preferredVersion}`;
          
          try {
            const resourceList = await fetchApi<V1APIResourceList>(apiBase);
            for (const resource of resourceList.resources) {
              // Skip subresources
              if (resource.name.includes('/')) continue;

              const enrichedResource = {
                ...resource,
                group: resource.group || group.name,
                version: resource.version || preferredVersion,
              };
              addResourceToMap(resourceMap, enrichedResource);
            }
          } catch (e) {
            console.warn(`Failed to fetch resources for ${apiBase}:`, e);
          }
        })
      );
    } catch (e) {
      console.warn('Failed to fetch API groups:', e);
    }

    discoveryCache = resourceMap;
    discoveryPromise = null;
    return resourceMap;
  })();

  return discoveryPromise;
}

// Get resource config by plural name
export async function getResourceConfig(plural: string): Promise<V1APIResource | undefined> {
  const resources = await discoverResources();
  return resources.get(plural);
}

// Get resource config by kind name
export async function getResourceConfigByKind(kind: string, apiVersion?: string): Promise<V1APIResource | undefined> {
  const resources = await discoverResources();
  
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

// Preload discovery (call on app startup)
export function preloadDiscovery(): void {
  discoverResources().catch(console.error);
}

// Re-export V1APIResource for consumers
export type { V1APIResource, V1CustomResourceDefinition } from '@kubernetes/client-node';

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
