// Adapter Registry
// Maps resource kinds to their adapters for data extraction

import type { ResourceAdapter, ResourceSections, ResourceAction } from './adapters/types';
import type { KubernetesResource } from '../../api/kubernetes/kubernetes';

// Import all adapters
import { DeploymentAdapter } from './adapters/DeploymentAdapter';
import { PodAdapter } from './adapters/PodAdapter';
import { StatefulSetAdapter } from './adapters/StatefulSetAdapter';
import { DaemonSetAdapter } from './adapters/DaemonSetAdapter';
import { NodeAdapter } from './adapters/NodeAdapter';
import { CronJobAdapter } from './adapters/CronJobAdapter';
import { JobAdapter } from './adapters/JobAdapter';
import { ReplicaSetAdapter } from './adapters/ReplicaSetAdapter';
import { PersistentVolumeAdapter } from './adapters/PersistentVolumeAdapter';
import { PersistentVolumeClaimAdapter } from './adapters/PersistentVolumeClaimAdapter';
import { ApplicationAdapter } from './adapters/ApplicationAdapter';
import { ApplicationSetAdapter } from './adapters/ApplicationSetAdapter';
import { CertificateAdapter } from './adapters/CertificateAdapter';
import { CertificateRequestAdapter } from './adapters/CertificateRequestAdapter';
import { EventAdapter } from './adapters/EventAdapter';
import { ServiceAdapter } from './adapters/ServiceAdapter';
import { SecretAdapter } from './adapters/SecretAdapter';
import { ConfigMapAdapter } from './adapters/ConfigMapAdapter';
import { GatewayAdapter } from './adapters/GatewayAdapter';
import { HTTPRouteAdapter } from './adapters/HTTPRouteAdapter';
import { GRPCRouteAdapter } from './adapters/GRPCRouteAdapter';
import { IngressAdapter } from './adapters/IngressAdapter';

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
  ApplicationAdapter,
  ApplicationSetAdapter,
  CertificateAdapter,
  CertificateRequestAdapter,
  EventAdapter,
  ServiceAdapter,
  SecretAdapter,
  ConfigMapAdapter,
  GatewayAdapter,
  HTTPRouteAdapter,
  GRPCRouteAdapter,
  IngressAdapter,
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
export function adaptResource(context: string, resource: KubernetesResource): ResourceSections | null {
  const kind = resource.kind;
  if (!kind) return null;
  
  const adapter = getAdapter(kind);
  if (!adapter) return null;
  return adapter.adapt(context, resource);
}

/**
 * Get actions available for a resource
 */
export function getResourceActions(resource: KubernetesResource): ResourceAction[] {
  const kind = resource.kind;
  if (!kind) return [];
  
  const adapter = getAdapter(kind);
  if (!adapter?.actions) return [];
  
  // Filter actions based on visibility
  return adapter.actions.filter(action => 
    !action.isVisible || action.isVisible(resource)
  );
}

/**
 * Get all supported kinds
 */
export function getSupportedKinds(): string[] {
  return Array.from(adapterMap.keys());
}

// Command palette adapter
export { createKubernetesAdapter } from './Commands';
