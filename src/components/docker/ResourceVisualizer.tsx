// ResourceVisualizer - Unified renderer for Docker resources
//
// This component renders the sections produced by Docker adapters.
// It provides a consistent look and feel across all Docker resource types.

import type { ContainerInspect, DockerImage, DockerVolume, DockerNetworkInspect } from '../../api/docker/docker';
import { adaptResource, getResourceActions } from './index';
import { ActionBar } from '../sections/ActionBar';
import { SectionRenderer } from '../sections/SectionRenderer';

// ============================================
// MAIN COMPONENT
// ============================================

type DockerDetailResource = ContainerInspect | DockerImage | DockerVolume | DockerNetworkInspect;

interface ResourceVisualizerProps {
  resource: DockerDetailResource;
  onActionComplete?: () => void;
  hideActions?: boolean;
}

// Determine resource type from the resource object
function getResourceType(resource: DockerDetailResource): string {
  // ContainerInspect has State, Config, etc.
  if ('Config' in resource && 'State' in resource) return 'container';
  // DockerImage has RepoTags, RepoDigests
  if ('RepoTags' in resource || 'RepoDigests' in resource) return 'image';
  // DockerVolume has Mountpoint and Driver
  if ('Mountpoint' in resource && 'Driver' in resource && !('IPAM' in resource)) return 'volume';
  // DockerNetworkInspect has IPAM and Containers (object type)
  if ('IPAM' in resource) return 'network';
  return 'container';
}

export function ResourceVisualizer({ resource, onActionComplete, hideActions = false }: ResourceVisualizerProps) {
  const resourceType = getResourceType(resource);
  const sections = adaptResource(resource, resourceType);
  const actions = getResourceActions(resource, resourceType);

  if (!sections || sections.sections.length === 0) {
    return (
      <div className="text-neutral-500 text-sm">
        No visualization available
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!hideActions && actions.length > 0 && (
        <ActionBar 
          actions={actions} 
          resource={resource} 
          onActionComplete={onActionComplete}
        />
      )}
      {sections.sections.map(section => (
        <SectionRenderer key={section.id} section={section} />
      ))}
    </div>
  );
}
