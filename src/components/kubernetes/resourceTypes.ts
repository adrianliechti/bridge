/**
 * Shared resource type configuration for Kubernetes resources
 * Used by both Nav.tsx and Commands.ts (command palette)
 */

import {
  Box,
  Rocket,
  Layers,
  Ghost,
  Database,
  Zap,
  Clock,
  FileText,
  KeyRound,
  Plug,
  Globe,
  HardDrive,
  Disc,
  FolderOpen,
  Server,
  Newspaper,
  Network,
  ShieldCheck,
  FileCheck,
  AppWindow,
  LayoutGrid,
  MonitorCog,
  Hexagon,
  type LucideIcon,
} from 'lucide-react';
import type { V1APIResource } from '../../api/kubernetes/kubernetesTable';

/**
 * Category types for resource grouping
 */
export type ResourceCategory = 'workloads' | 'config' | 'network' | 'storage' | 'cluster' | 'crd';

/**
 * Built-in resource type definition with icon and category
 */
export interface ResourceTypeConfig {
  /** Plural name (e.g., 'pods', 'deployments') */
  kind: string;
  /** Display label */
  label: string;
  /** Lucide icon component */
  icon: LucideIcon;
  /** Category for grouping */
  category: ResourceCategory;
}

/**
 * Human-readable labels for categories
 */
export const categoryLabels: Record<ResourceCategory | string, string> = {
  workloads: 'Workloads',
  config: 'Config',
  network: 'Network',
  storage: 'Storage',
  cluster: 'Cluster',
  crd: 'Custom Resources',
};

/**
 * Built-in Kubernetes resource types with icons and categories
 * Note: Aliases (shortNames, singularName) come from the Discovery API at runtime
 */
export const builtInResourceTypes: ResourceTypeConfig[] = [
  // Workloads
  { kind: 'pods', label: 'Pods', icon: Box, category: 'workloads' },
  { kind: 'deployments', label: 'Deployments', icon: Rocket, category: 'workloads' },
  { kind: 'daemonsets', label: 'DaemonSets', icon: Ghost, category: 'workloads' },
  { kind: 'statefulsets', label: 'StatefulSets', icon: Database, category: 'workloads' },
  { kind: 'replicasets', label: 'ReplicaSets', icon: Layers, category: 'workloads' },
  { kind: 'jobs', label: 'Jobs', icon: Zap, category: 'workloads' },
  { kind: 'cronjobs', label: 'CronJobs', icon: Clock, category: 'workloads' },
  // Config
  { kind: 'secrets', label: 'Secrets', icon: KeyRound, category: 'config' },
  { kind: 'configmaps', label: 'ConfigMaps', icon: FileText, category: 'config' },
  { kind: 'applications', label: 'Applications', icon: AppWindow, category: 'config' },
  { kind: 'applicationsets', label: 'ApplicationSets', icon: LayoutGrid, category: 'config' },
  { kind: 'certificates', label: 'Certificates', icon: ShieldCheck, category: 'config' },
  { kind: 'certificaterequests', label: 'CertificateRequests', icon: FileCheck, category: 'config' },
  // Network
  { kind: 'services', label: 'Services', icon: Plug, category: 'network' },
  { kind: 'ingresses', label: 'Ingresses', icon: Globe, category: 'network' },
  { kind: 'gateways', label: 'Gateways', icon: Network, category: 'network' },
  { kind: 'httproutes', label: 'HTTPRoutes', icon: Globe, category: 'network' },
  { kind: 'grpcroutes', label: 'GRPCRoutes', icon: Globe, category: 'network' },
  { kind: 'tcproutes', label: 'TCPRoutes', icon: Network, category: 'network' },
  { kind: 'udproutes', label: 'UDPRoutes', icon: Network, category: 'network' },
  { kind: 'tlsroutes', label: 'TLSRoutes', icon: Network, category: 'network' },
  // Storage
  { kind: 'persistentvolumes', label: 'PersistentVolumes', icon: HardDrive, category: 'storage' },
  { kind: 'persistentvolumeclaims', label: 'PersistentVolumeClaims', icon: Disc, category: 'storage' },
  // Cluster
  { kind: 'namespaces', label: 'Namespaces', icon: FolderOpen, category: 'cluster' },
  { kind: 'nodes', label: 'Nodes', icon: Server, category: 'cluster' },
  { kind: 'events', label: 'Events', icon: Newspaper, category: 'cluster' },
];

/**
 * Virtual resource types for command palette (not from Kubernetes API)
 */
export const virtualResourceTypes: ResourceTypeConfig[] = [
  { kind: 'contexts', label: 'Contexts', icon: MonitorCog, category: 'cluster' },
];

/**
 * Default icon for CRDs and unknown resource types
 */
export const defaultResourceIcon: LucideIcon = Hexagon;

/**
 * Map for quick lookup by kind
 */
const resourceTypeMap = new Map<string, ResourceTypeConfig>();
for (const rt of builtInResourceTypes) {
  resourceTypeMap.set(rt.kind, rt);
}
for (const rt of virtualResourceTypes) {
  resourceTypeMap.set(rt.kind, rt);
}

/**
 * Get resource type config by kind (plural name)
 */
export function getResourceTypeConfig(kind: string): ResourceTypeConfig | undefined {
  return resourceTypeMap.get(kind);
}

/**
 * Get icon for a resource kind
 */
export function getResourceIcon(kind: string): LucideIcon {
  return resourceTypeMap.get(kind)?.icon ?? defaultResourceIcon;
}

/**
 * Get category for a resource kind
 */
export function getResourceCategory(kind: string): ResourceCategory | undefined {
  return resourceTypeMap.get(kind)?.category;
}

/**
 * Get label for a resource kind
 */
export function getResourceLabel(kind: string): string {
  return resourceTypeMap.get(kind)?.label ?? kind;
}

/**
 * Get aliases for a resource from V1APIResource (shortNames + singularName)
 */
export function getResourceAliases(config: V1APIResource | undefined): string[] {
  if (!config) return [];
  const aliases: string[] = [];
  if (config.singularName) {
    aliases.push(config.singularName);
  }
  if (config.shortNames) {
    aliases.push(...config.shortNames);
  }
  return aliases;
}

/**
 * Check if a query matches a resource type (by kind, label, singularName, or shortNames)
 */
export function matchesResourceType(
  query: string,
  resourceType: ResourceTypeConfig,
  apiResource?: V1APIResource
): boolean {
  const q = query.toLowerCase();
  
  // Match by kind (plural name)
  if (resourceType.kind.toLowerCase() === q) return true;
  // Match by label
  if (resourceType.label.toLowerCase() === q) return true;
  
  // Match by discovery API aliases (singularName, shortNames)
  if (apiResource) {
    if (apiResource.singularName?.toLowerCase() === q) return true;
    if (apiResource.shortNames?.some(sn => sn.toLowerCase() === q)) return true;
  }
  
  return false;
}
