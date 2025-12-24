// Kubernetes API discovery
// Discovers all available resources from the cluster

import type {
  V1APIResource,
  V1APIResourceList,
  V1APIGroup,
  V1APIGroupList,
} from '@kubernetes/client-node';
import { fetchApi } from './kubernetes';

// Discovery cache
let discoveryCache: Map<string, V1APIResource> | null = null;
let discoveryPromise: Promise<Map<string, V1APIResource>> | null = null;

// Build API base path from group and version
export function getApiBase(resource: V1APIResource): string {
  const group = resource.group || '';
  const version = resource.version || 'v1';
  return group ? `/apis/${group}/${version}` : '/api/v1';
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
        
        resourceMap.set(resource.name, {
          ...resource,
          group: '',
          version: 'v1',
        });
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

              resourceMap.set(resource.name, {
                ...resource,
                group: resource.group || group.name,
                version: resource.version || preferredVersion,
              });
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

// Preload discovery (call on app startup)
export function preloadDiscovery(): void {
  discoverResources().catch(console.error);
}

// Re-export V1APIResource for consumers
export type { V1APIResource } from '@kubernetes/client-node';
