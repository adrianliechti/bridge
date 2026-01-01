// Docker Adapter Types
//
// Defines the adapter interface for Docker resources.

import type { ContainerSummary, ContainerInspectResponse, ImageSummary, DockerVolume, DockerNetwork, DockerNetworkInspect } from '../../../api/docker/docker';

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
  EnvVarData,
  EnvFromData,
  SectionData,
  Section,
  ResourceSections,
  ActionVariant,
} from '../../sections/types';

// Import the generic ResourceAction type and specialize it
import type { ResourceAction as GenericResourceAction, ResourceSections } from '../../sections/types';

/** Docker container resource type */
export type DockerResource = ContainerSummary | ContainerInspectResponse | ImageSummary | DockerVolume | DockerNetwork | DockerNetworkInspect;

/** Docker-specific action type */
export type ResourceAction = GenericResourceAction<DockerResource>;

// ============================================
// DOCKER ADAPTER INTERFACE
// ============================================

/**
 * DockerAdapter extracts display-ready data from a Docker resource.
 * Each resource type implements this interface to provide standardized
 * data that the visualizer can render using common section components.
 */
export interface DockerAdapter<T = DockerResource> {
  /** The Docker resource type(s) this adapter handles */
  readonly types: string[];

  /** Extract all display sections from the resource */
  adapt(resource: T): ResourceSections;

  /** Optional actions that can be performed on this resource type */
  readonly actions?: ResourceAction[];
}
