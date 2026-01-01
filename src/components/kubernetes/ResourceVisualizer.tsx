// ResourceVisualizer - Unified renderer for all resource types
//
// This component renders the sections produced by resource adapters.
// It provides a consistent look and feel across all resource kinds.

import { useMemo } from 'react';
import type { KubernetesResource } from '../../api/kubernetes/kubernetes';
import { adaptResource, getResourceActions } from './index';
import { ActionBar } from '../sections/ActionBar';
import { SectionRenderer } from '../sections/SectionRenderer';

// ============================================
// MAIN COMPONENT
// ============================================

interface ResourceVisualizerProps {
  context: string;
  resource: KubernetesResource;
  onActionComplete?: () => void;
  hideActions?: boolean;
}

export function ResourceVisualizer({ context, resource, onActionComplete, hideActions = false }: ResourceVisualizerProps) {
  // Memoize sections based on resource version to avoid recreating section objects on every render
  // This helps prevent unnecessary re-renders of child components when data hasn't changed
  const sections = useMemo(
    () => adaptResource(context, resource),
    [context, resource]
  );
  const actions = useMemo(
    () => getResourceActions(resource),
    [resource]
  );

  // Get kubernetes.io/description annotation if present
  const description = resource.metadata?.annotations?.['kubernetes.io/description'];

  if (!sections || sections.sections.length === 0) {
    return (
      <div className="text-neutral-500 text-sm">
        No visualization available for {resource.kind}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!hideActions && (
        <ActionBar 
          context={context}
          actions={actions} 
          resource={resource} 
          onActionComplete={onActionComplete}
        />
      )}
      {description && (
        <p className="text-xs text-neutral-600 dark:text-neutral-400">{description}</p>
      )}
      {sections.sections.map(section => (
        <SectionRenderer key={section.id} section={section} />
      ))}
    </div>
  );
}
