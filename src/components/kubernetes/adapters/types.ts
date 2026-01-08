// Kubernetes Adapter Types
//
// This pattern separates DATA EXTRACTION (adapters) from PRESENTATION (renderer).
// Each resource kind has an adapter that extracts structured data.
// A single renderer displays all sections consistently.

import type { KubernetesResource } from '../../../api/kubernetes/kubernetes';

// Re-export all section types for convenience
export type {
  StatusLevel,
  GaugeColor,
  GridIcon,
  StatusCardData,
  GaugeData,
  GridData,
  InfoRowData,
  ContainerData,
  VolumeData,
  CapacityBarData,
  TaintData,
  RelatedResourceData,
  JobData,
  ReplicaSetData,
  PVCData,
  VolumeClaimTemplateData,
  EnvVarData,
  EnvFromData,
  MetricsData,
  ResourceQuotaData,
  SectionData,
  Section,
  ResourceSections,
  ActionVariant,
} from '../../sections/types';

// Import the generic ResourceAction type and specialize it
import type { ResourceAction as GenericResourceAction } from '../../sections/types';

/** Kubernetes-specific action type */
export type ResourceAction = GenericResourceAction<KubernetesResource>;

// ============================================
// KUBERNETES ADAPTER INTERFACE
// ============================================

import type { ResourceSections } from '../../sections/types';

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
  adapt(context: string, resource: T): ResourceSections;

  /** Actions that can be performed on this resource type */
  readonly actions?: ResourceAction[];
}
