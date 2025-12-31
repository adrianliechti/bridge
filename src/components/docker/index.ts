// Docker Adapter Registry
// Maps Docker resource types to their adapters for data extraction

import type { DockerAdapter, ResourceSections, ResourceAction } from './adapters/types';
import type { ContainerInspectResponse } from '../../api/docker/docker';

// Import all adapters
import { ContainerAdapter } from './adapters/ContainerAdapter';

// All registered adapters
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adapters: DockerAdapter<any>[] = [
  ContainerAdapter,
];

// Build lookup map (type -> adapter)
const adapterMap = new Map<string, DockerAdapter>();
adapters.forEach(adapter => {
  adapter.types.forEach(type => {
    adapterMap.set(type.toLowerCase(), adapter);
  });
});

/**
 * Get the adapter for a given Docker resource type
 */
export function getAdapter(type: string): DockerAdapter | null {
  return adapterMap.get(type.toLowerCase()) ?? null;
}

/**
 * Check if an adapter exists for a given type
 */
export function hasAdapter(type: string): boolean {
  return adapterMap.has(type.toLowerCase());
}

/**
 * Adapt a Docker resource to display sections using the appropriate adapter
 */
export function adaptResource(resource: ContainerInspectResponse): ResourceSections | null {
  // For now, we only support containers
  const adapter = getAdapter('container');
  if (!adapter) return null;
  return adapter.adapt(resource);
}

/**
 * Get actions available for a Docker resource
 */
export function getResourceActions(resource: ContainerInspectResponse): ResourceAction[] {
  const adapter = getAdapter('container');
  if (!adapter?.actions) return [];
  
  // Filter actions based on visibility
  return adapter.actions.filter(action => 
    !action.isVisible || action.isVisible(resource)
  );
}

/**
 * Get all supported Docker resource types
 */
export function getSupportedTypes(): string[] {
  return Array.from(adapterMap.keys());
}

// Command palette adapter
export { createDockerAdapter, type DockerResourceType } from './Commands';
