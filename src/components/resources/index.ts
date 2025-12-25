// Adapter Registry
// Maps resource kinds to their adapters for data extraction

import type { ResourceAdapter, ResourceSections } from './types';
import type { KubernetesResource } from '../../api/kubernetes';

// Import all adapters
import { DeploymentAdapter } from './DeploymentAdapter';
import { PodAdapter } from './PodAdapter';
import { StatefulSetAdapter } from './StatefulSetAdapter';
import { DaemonSetAdapter } from './DaemonSetAdapter';
import { NodeAdapter } from './NodeAdapter';
import { CronJobAdapter } from './CronJobAdapter';
import { JobAdapter } from './JobAdapter';
import { ReplicaSetAdapter } from './ReplicaSetAdapter';
import { PersistentVolumeAdapter } from './PersistentVolumeAdapter';
import { PersistentVolumeClaimAdapter } from './PersistentVolumeClaimAdapter';

// All registered adapters (using generic type to allow specific implementations)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adapters: ResourceAdapter<any>[] = [
  DeploymentAdapter,
  PodAdapter,
  StatefulSetAdapter,
  DaemonSetAdapter,
  NodeAdapter,
  CronJobAdapter,
  JobAdapter,
  ReplicaSetAdapter,
  PersistentVolumeAdapter,
  PersistentVolumeClaimAdapter,
];

// Build lookup map (kind -> adapter)
const adapterMap = new Map<string, ResourceAdapter>();
adapters.forEach(adapter => {
  adapter.kinds.forEach(kind => {
    adapterMap.set(kind.toLowerCase(), adapter);
  });
});

/**
 * Get the adapter for a given resource kind
 */
export function getAdapter(kind: string): ResourceAdapter | null {
  return adapterMap.get(kind.toLowerCase()) ?? null;
}

/**
 * Check if an adapter exists for a given kind
 */
export function hasAdapter(kind: string): boolean {
  return adapterMap.has(kind.toLowerCase());
}

/**
 * Adapt a resource to display sections using the appropriate adapter
 */
export function adaptResource(resource: KubernetesResource, namespace?: string): ResourceSections | null {
  const kind = resource.kind;
  if (!kind) return null;
  
  const adapter = getAdapter(kind);
  if (!adapter) return null;
  return adapter.adapt(resource, namespace);
}

/**
 * Get all supported kinds
 */
export function getSupportedKinds(): string[] {
  return Array.from(adapterMap.keys());
}

// Re-export adapters for direct access if needed
export { DeploymentAdapter } from './DeploymentAdapter';
export { PodAdapter } from './PodAdapter';
export { StatefulSetAdapter } from './StatefulSetAdapter';
export { DaemonSetAdapter } from './DaemonSetAdapter';
export { NodeAdapter } from './NodeAdapter';
export { CronJobAdapter } from './CronJobAdapter';
export { JobAdapter } from './JobAdapter';
export { ReplicaSetAdapter } from './ReplicaSetAdapter';
export { PersistentVolumeAdapter } from './PersistentVolumeAdapter';
export { PersistentVolumeClaimAdapter } from './PersistentVolumeClaimAdapter';
