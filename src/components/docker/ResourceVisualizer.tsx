// ResourceVisualizer - Unified renderer for Docker resources
//
// This component renders the sections produced by Docker adapters.
// It provides a consistent look and feel across all Docker resource types.

import type { ContainerInspect, DockerImage, DockerVolume, DockerNetworkInspect, ComposeApplication } from '../../api/docker/docker';
import { adaptResource, getResourceActions } from './index';
import { ActionBar } from '../sections/ActionBar';
import { SectionRenderer } from '../sections/SectionRenderer';

// ============================================
// MAIN COMPONENT
// ============================================

type DockerDetailResource = ContainerInspect | DockerImage | DockerVolume | DockerNetworkInspect | ComposeApplication;

interface ResourceVisualizerProps {
  context: string;
  resource: DockerDetailResource;
  onActionComplete?: () => void;
  hideActions?: boolean;
  hideLabels?: boolean;
}

// Determine resource type from the resource object
function getResourceType(resource: DockerDetailResource): string {
  // ComposeApplication has services array and name
  if ('services' in resource && Array.isArray(resource.services)) return 'application';
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

export function ResourceVisualizer({ context, resource, onActionComplete, hideActions = false, hideLabels = false }: ResourceVisualizerProps) {
  const resourceType = getResourceType(resource);
  const sections = adaptResource(resource, resourceType, context);
  const actions = getResourceActions(resource, resourceType);
  
  if (!sections) {
    return (
      <div className="text-neutral-500 text-sm">
        No visualization available
      </div>
    );
  }

  // Filter out labels section if hideLabels is true
  const filteredSections = hideLabels 
    ? sections.sections.filter(section => section.data.type !== 'labels')
    : sections.sections;

  if (filteredSections.length === 0) {
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
          context={context}
          actions={actions} 
          resource={resource} 
          onActionComplete={onActionComplete}
        />
      )}
      {filteredSections.map(section => (
        <SectionRenderer key={section.id} section={section} />
      ))}
    </div>
  );
}
