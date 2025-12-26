// Types for the Resource Visualizer Adapter Pattern
//
// This pattern separates DATA EXTRACTION (adapters) from PRESENTATION (renderer).
// Each resource kind has an adapter that extracts structured data.
// A single renderer displays all sections consistently.

import type { ReactNode } from 'react';
import type { KubernetesResource } from '../../api/kubernetes';

// ============================================
// STATUS TYPES
// ============================================

/** Status levels for visual indicators */
export type StatusLevel = 'success' | 'warning' | 'error' | 'neutral';

/** Gauge color options */
export type GaugeColor = 'emerald' | 'blue' | 'cyan' | 'purple' | 'amber';

/** Pod grid icon options */
export type PodGridIcon = 'box' | 'database' | 'server';

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

/** Condition from status.conditions */
export interface ConditionData {
  type: string;
  status: string;
  reason?: string;
  message?: string;
  isPositive: boolean;
}

/** Visual pod/replica grid */
export interface PodGridData {
  total: number;
  ready: number;
  available?: number;
  current?: number;
  showOrdinal?: boolean;
  icon?: PodGridIcon;
  /** Optional custom titles for each pod (for StatefulSet ordinal naming) */
  podTitles?: string[];
}

/** Key-value info row */
export interface InfoRowData {
  label: string;
  value: string | number | undefined;
  color?: string;
}

/** Container information */
export interface ContainerData {
  name: string;
  image: string;
  state?: 'running' | 'waiting' | 'terminated';
  stateReason?: string;
  ready?: boolean;
  restartCount?: number;
  resources?: {
    requests?: Record<string, string>;
    limits?: Record<string, string>;
  };
  ports?: Array<{ name?: string; containerPort: number; protocol?: string }>;
  command?: string[];
  args?: string[];
  mounts?: Array<{ name: string; mountPath: string; readOnly?: boolean; subPath?: string }>;
}

/** Volume information */
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

/** Resource capacity bar (for Nodes) */
export interface CapacityBarData {
  label: string;
  icon?: ReactNode;
  capacity: string;
  allocatable: string;
}

/** Taint (for Nodes) */
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
  /** Optional icon override */
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
}

/** ReplicaSet display data */
export interface ReplicaSetData {
  name: string;
  replicas: number;
  readyReplicas: number;
  revision?: string;
  images: string[];
  isCurrent: boolean;
}

/** PVC display data */
export interface PVCData {
  name: string;
  status: string;
  capacity?: string;
  storageClass?: string;
}

/** Volume Claim Template data */
export interface VolumeClaimTemplateData {
  name: string;
  size?: string;
  storageClass?: string;
  accessModes?: string[];
}

// ============================================
// SECTION DEFINITIONS
// ============================================

/**
 * A section is a named group of data to display.
 * The `type` field determines how it's rendered.
 */
export type SectionData =
  | { type: 'status-cards'; items: StatusCardData[] }
  | { type: 'gauges'; items: GaugeData[]; showPodGrid?: PodGridData }
  | { type: 'pod-grid'; data: PodGridData }
  | { type: 'conditions'; items: ConditionData[] }
  | { type: 'info-grid'; items: InfoRowData[]; columns?: 1 | 2 }
  | { type: 'containers'; items: ContainerData[]; title?: string }
  | { type: 'volumes'; items: VolumeData[] }
  | { type: 'labels'; labels: Record<string, string>; title?: string }
  | { type: 'capacity-bars'; items: CapacityBarData[] }
  | { type: 'taints'; items: TaintData[] }
  | { type: 'container-images'; containers: Array<{ name: string; image?: string }> }
  | { type: 'node-selector'; selector: Record<string, string> }
  | { type: 'related-replicasets'; loader: () => Promise<ReplicaSetData[]> }
  | { type: 'related-pvcs'; loader: () => Promise<PVCData[]> }
  | { type: 'related-jobs'; loader: () => Promise<JobData[]> }
  | { type: 'volume-claim-templates'; items: VolumeClaimTemplateData[] }
  | { type: 'schedule'; schedule: string; description: string }
  | { type: 'job-progress'; completions: number; succeeded: number; failed: number; active: number }
  | { type: 'timeline'; startTime?: Date; completionTime?: Date }
  | { type: 'addresses'; addresses: Array<{ type: string; address: string }> }
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
export interface ResourceAction {
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
   * @param resource - The resource to act upon
   * @param namespace - The namespace of the resource
   * @returns A promise that resolves when the action completes
   */
  execute: (resource: KubernetesResource, namespace?: string) => Promise<void>;
  /** 
   * Optional function to determine if action should be shown.
   * @param resource - The resource to check
   * @returns true if the action should be displayed
   */
  isVisible?: (resource: KubernetesResource) => boolean;
  /**
   * Optional function to determine if action should be disabled.
   * @param resource - The resource to check
   * @returns true if the action should be disabled, or a string with the reason
   */
  isDisabled?: (resource: KubernetesResource) => boolean | string;
}

// ============================================
// ADAPTER INTERFACE
// ============================================

/**
 * ResourceAdapter extracts display-ready data from a Kubernetes resource.
 * Each resource kind implements this interface to provide standardized
 * data that ResourceVisualizer can render using common components.
 * 
 * Benefits:
 * - Separation of concerns: data extraction vs presentation
 * - Testability: adapters are pure functions (mostly)
 * - Consistency: all resources rendered the same way
 * - Maintainability: add new resources by implementing adapt()
 */
export interface ResourceAdapter<T = KubernetesResource> {
  /** The Kubernetes kind(s) this adapter handles */
  readonly kinds: string[];
  
  /** Extract all display sections from the resource */
  adapt(resource: T, namespace?: string): ResourceSections;
  
  /** Optional actions that can be performed on this resource type */
  readonly actions?: ResourceAction[];
}
