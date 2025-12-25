// Base types and registry for specialized resource visualizers

import type { KubernetesResource } from '../../api/kubernetes';

export interface ResourceVisualizerProps {
  resource: KubernetesResource;
  namespace?: string;
}

// Registry of specialized visualizers by resource kind
type VisualizerComponent = React.ComponentType<ResourceVisualizerProps>;
const visualizerRegistry = new Map<string, VisualizerComponent>();

export function registerVisualizer(kind: string, component: VisualizerComponent) {
  visualizerRegistry.set(kind.toLowerCase(), component);
}

export function getVisualizer(kind: string): VisualizerComponent | null {
  return visualizerRegistry.get(kind.toLowerCase()) ?? null;
}
