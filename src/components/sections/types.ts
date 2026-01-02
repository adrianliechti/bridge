// Agnostic Section Types
//
// These types define the data shapes that section components render.
// They are platform-agnostic and can be used by any adapter (Kubernetes, Docker, etc.)

import type { ReactNode } from 'react';

// ============================================
// STATUS TYPES
// ============================================

/** Status levels for visual indicators */
export type StatusLevel = 'success' | 'warning' | 'error' | 'neutral';

/** Gauge color options */
export type GaugeColor = 'emerald' | 'blue' | 'cyan' | 'purple' | 'amber';

/** Grid icon options */
export type GridIcon = 'box' | 'database' | 'server';

// ============================================
// SECTION DATA TYPES
// ============================================

/** A single status card (e.g., "Phase: Running") */
export interface StatusCardData {
  label: string;
  value: string | number;
  status?: StatusLevel;
  icon?: ReactNode;
  description?: string;
}

/** Gauge showing progress (e.g., "Ready: 3/5") */
export interface GaugeData {
  label: string;
  current: number;
  total: number;
  color: GaugeColor;
}

/** Visual grid for pods/replicas/containers */
export interface GridData {
  total: number;
  ready: number;
  available?: number;
  current?: number;
  showOrdinal?: boolean;
  icon?: GridIcon;
  /** Optional custom titles for each item (e.g., StatefulSet ordinal naming) */
  podTitles?: string[];
}

/** Key-value info row */
export interface InfoRowData {
  label: string;
  value: string | number | undefined;
  color?: string;
}

/** Container information (works for both Kubernetes and Docker) */
export interface ContainerData {
  name: string;
  image: string;
  state?: 'running' | 'waiting' | 'terminated' | 'paused' | 'exited' | 'created' | 'dead' | 'removing' | 'restarting';
  stateReason?: string;
  stateMessage?: string;
  ready?: boolean;
  restartCount?: number;
  /** Group name for grouped containers (e.g., service name in Docker Compose) */
  group?: string;
  /** Replica status shown on the right (e.g., "1/1") */
  replicas?: string;
  currentTermination?: {
    reason?: string;
    message?: string;
    exitCode?: number;
    signal?: number;
    startedAt?: string;
    finishedAt?: string;
  };
  lastTermination?: {
    reason?: string;
    exitCode?: number;
    signal?: number;
    finishedAt?: string;
  };
  resources?: {
    requests?: Record<string, string>;
    limits?: Record<string, string>;
  };
  ports?: Array<{ name?: string; containerPort: number; protocol?: string; hostPort?: number }>;
  command?: string[];
  args?: string[];
  mounts?: Array<{ name: string; mountPath: string; readOnly?: boolean; subPath?: string }>;
  /** Environment variables */
  env?: EnvVarData[];
  /** Bulk env imports from ConfigMaps/Secrets */
  envFrom?: EnvFromData[];
  /** Live metrics (populated by metricsLoader) */
  metrics?: {
    cpu: { usage: string; usageNanoCores: number };
    memory: { usage: string; usageBytes: number };
  };
}

/** Volume/mount information */
export interface VolumeData {
  name: string;
  type: string;
  source: string;
  extra?: Record<string, string>;
  mounts: Array<{
    container: string;
    mountPath: string;
    readOnly: boolean;
    subPath?: string;
  }>;
}

/** Resource capacity bar */
export interface CapacityBarData {
  label: string;
  icon?: ReactNode;
  capacity: string;
  allocatable: string;
}

/** Taint/constraint data */
export interface TaintData {
  key: string;
  value?: string;
  effect: string;
}

/** Related resource display (async loaded) */
export interface RelatedResourceData {
  name: string;
  status?: StatusLevel;
  statusText?: string;
  details?: string;
  isCurrent?: boolean;
}

/** Job display data */
export interface JobData {
  name: string;
  status: 'Running' | 'Complete' | 'Failed';
  startTime?: string;
  completionTime?: string;
  succeeded?: number;
  failed?: number;
  namespace?: string;
  context?: string;
}

/** ReplicaSet display data */
export interface ReplicaSetData {
  name: string;
  replicas: number;
  readyReplicas: number;
  images: string[];
  isCurrent: boolean;
  namespace?: string;
  context?: string;
}

/** PVC display data */
export interface PVCData {
  name: string;
  status: string;
  capacity?: string;
  storageClass?: string;
  namespace?: string;
  context?: string;
}

/** Volume Claim Template data */
export interface VolumeClaimTemplateData {
  name: string;
  size?: string;
  storageClass?: string;
  accessModes?: string[];
}

/** Environment variable data */
export interface EnvVarData {
  /** Variable name */
  name: string;
  /** Plain value (mutually exclusive with valueFrom) */
  value?: string;
  /** Reference to ConfigMap, Secret, or field */
  valueFrom?: {
    type: 'configMapKeyRef' | 'secretKeyRef' | 'fieldRef' | 'resourceFieldRef';
    /** Source name (ConfigMap/Secret name, or field path) */
    source: string;
    /** Key within the source (for ConfigMap/Secret refs) */
    key?: string;
  };
}

/** envFrom bulk import data */
export interface EnvFromData {
  /** ConfigMap or Secret name */
  name: string;
  /** Type of source */
  type: 'configMap' | 'secret';
  /** Optional prefix for imported keys */
  prefix?: string;
}

/** Metrics data */
export interface MetricsData {
  cpu: {
    usage: string;
    usageNanoCores: number;
    allocatable?: string;
    allocatableNanoCores?: number;
  };
  memory: {
    usage: string;
    usageBytes: number;
    allocatable?: string;
    allocatableBytes?: number;
  };
}

/** Resource quota data (aggregated requests/limits) */
export interface ResourceQuotaData {
  cpu: {
    requests?: string;
    requestsNanoCores?: number;
    limits?: string;
    limitsNanoCores?: number;
  };
  memory: {
    requests?: string;
    requestsBytes?: number;
    limits?: string;
    limitsBytes?: number;
  };
}

/**
 * A section is a named group of data to display.
 * The `type` field determines how it's rendered.
 */
export type SectionData =
  | { type: 'status-cards'; items: StatusCardData[] }
  | { type: 'gauges'; items: GaugeData[]; showPodGrid?: GridData }
  | { type: 'info-grid'; items: InfoRowData[]; columns?: 1 | 2 | 3 }
  | { type: 'containers'; items: ContainerData[]; metricsLoader?: () => Promise<Map<string, { cpu: { usage: string; usageNanoCores: number }; memory: { usage: string; usageBytes: number } }> | null>; title?: string }
  | { type: 'volumes'; items: VolumeData[] }
  | { type: 'labels'; labels: Record<string, string>; title?: string }
  | { type: 'capacity-bars'; items: CapacityBarData[] }
  | { type: 'taints'; items: TaintData[] }
  | { type: 'container-images'; containers: Array<{ name: string; image?: string }> }
  | { type: 'related-replicasets'; loader: () => Promise<ReplicaSetData[]>; title?: string }
  | { type: 'related-pvcs'; loader: () => Promise<PVCData[]>; title?: string }
  | { type: 'related-jobs'; loader: () => Promise<JobData[]>; title?: string }
  | { type: 'volume-claim-templates'; items: VolumeClaimTemplateData[] }
  | { type: 'schedule'; schedule: string; description: string }
  | { type: 'job-progress'; completions: number; succeeded: number; failed: number; active: number }
  | { type: 'timeline'; startTime?: Date; completionTime?: Date }
  | { type: 'addresses'; addresses: Array<{ type: string; address: string }> }
  | { type: 'node-metrics'; loader: () => Promise<MetricsData | null>; title?: string }
  | { type: 'resource-quota'; data: ResourceQuotaData }
  | { type: 'custom'; render: () => ReactNode };

export interface Section {
  id: string;
  title?: string;
  data: SectionData;
}

/**
 * The complete set of sections returned by an adapter.
 */
export interface ResourceSections {
  sections: Section[];
}

// ============================================
// ACTION TYPES
// ============================================

/** Visual style for action buttons */
export type ActionVariant = 'primary' | 'secondary' | 'danger' | 'warning';

/**
 * An action that can be performed on a resource.
 * Actions are displayed as buttons in the resource visualizer.
 */
export interface ResourceAction<T = unknown> {
  /** Unique identifier for the action */
  id: string;
  /** Display label for the button */
  label: string;
  /** Optional icon component */
  icon?: ReactNode;
  /** Button style variant */
  variant?: ActionVariant;
  /** Whether the action requires confirmation */
  confirm?: {
    title: string;
    message: string;
    confirmLabel?: string;
  };
  /** 
   * Execute the action. 
   * @param context - The context name (cluster for K8s, host for Docker)
   * @param resource - The resource to act upon
   * @returns A promise that resolves when the action completes
   */
  execute: (context: string, resource: T) => Promise<void>;
  /** 
   * Optional function to determine if action should be shown.
   * @param resource - The resource to check
   * @returns true if the action should be displayed
   */
  isVisible?: (resource: T) => boolean;
  /**
   * Optional function to determine if action should be disabled.
   * @param resource - The resource to check
   * @returns true if the action should be disabled, or a string with the reason
   */
  isDisabled?: (resource: T) => boolean | string;
}
