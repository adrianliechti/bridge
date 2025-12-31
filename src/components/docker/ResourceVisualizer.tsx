// ResourceVisualizer - Unified renderer for Docker resources
//
// This component renders the sections produced by Docker adapters.
// It provides a consistent look and feel across all Docker resource types.

import type { ContainerInspectResponse } from '../../api/docker/docker';
import { adaptResource, getResourceActions } from './index';
import { ActionBar } from '../sections/ActionBar';
import { SectionRenderer } from '../sections/SectionRenderer';

// ============================================
// MAIN COMPONENT
// ============================================

interface ResourceVisualizerProps {
  resource: ContainerInspectResponse;
  onActionComplete?: () => void;
  hideActions?: boolean;
}

export function ResourceVisualizer({ resource, onActionComplete, hideActions = false }: ResourceVisualizerProps) {
  const sections = adaptResource(resource);
  const actions = getResourceActions(resource);

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
