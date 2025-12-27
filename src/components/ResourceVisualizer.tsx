// ResourceVisualizer - Unified renderer for all resource types
//
// This component renders the sections produced by resource adapters.
// It provides a consistent look and feel across all resource kinds.

import type { KubernetesResource } from '../api/kubernetes';
import { adaptResource, getResourceActions } from './adapters';
import { ActionBar } from './sections/ActionBar';
import { SectionRenderer } from './sections/SectionRenderer';

// ============================================
// MAIN COMPONENT
// ============================================

interface ResourceVisualizerProps {
  resource: KubernetesResource;
  namespace?: string;
  onActionComplete?: () => void;
  hideActions?: boolean;
}

export function ResourceVisualizer({ resource, namespace, onActionComplete, hideActions = false }: ResourceVisualizerProps) {
  const sections = adaptResource(resource, namespace);
  const actions = getResourceActions(resource);

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
    <div className="space-y-4">
      {!hideActions && (
        <ActionBar 
          actions={actions} 
          resource={resource} 
          namespace={namespace}
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
