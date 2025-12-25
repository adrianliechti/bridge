// DaemonSet Adapter
// Extracts display data from DaemonSet resources

import type { ResourceAdapter, ResourceSections } from './types';
import type { V1DaemonSet } from '@kubernetes/client-node';

export const DaemonSetAdapter: ResourceAdapter<V1DaemonSet> = {
  kinds: ['DaemonSet', 'DaemonSets'],

  adapt(resource): ResourceSections {
    const spec = resource.spec;
    const status = resource.status;
    const metadata = resource.metadata;

    if (!spec) {
      return { sections: [] };
    }

    const desiredNumberScheduled = status?.desiredNumberScheduled ?? 0;
    const currentNumberScheduled = status?.currentNumberScheduled ?? 0;
    const numberReady = status?.numberReady ?? 0;
    const numberAvailable = status?.numberAvailable ?? 0;
    const numberMisscheduled = status?.numberMisscheduled ?? 0;
    const updatedNumberScheduled = status?.updatedNumberScheduled ?? 0;
    
    // Filter labels (remove internal ones)
    const labels = metadata?.labels ?? {};
    const filteredLabels = Object.fromEntries(
      Object.entries(labels).filter(([key]) => 
        !key.includes('controller-revision-hash')
      )
    );
    
    // Filter annotations (remove internal ones)
    const annotations = metadata?.annotations ?? {};
    const filteredAnnotations = Object.fromEntries(
      Object.entries(annotations).filter(([key]) => 
        !key.includes('kubectl.kubernetes.io/last-applied-configuration')
      )
    );
    
    // Filter conditions to only show problematic ones
    const problematicConditions = (status?.conditions ?? []).filter(c => c.status !== 'True');

    return {
      sections: [
        // Node distribution gauges with pod grid
        {
          id: 'distribution',
          title: 'Node Distribution',
          data: {
            type: 'gauges',
            items: [
              { label: 'Scheduled', current: currentNumberScheduled, total: desiredNumberScheduled, color: 'blue' },
              { label: 'Ready', current: numberReady, total: desiredNumberScheduled, color: 'emerald' },
              { label: 'Available', current: numberAvailable, total: desiredNumberScheduled, color: 'cyan' },
            ],
            showPodGrid: {
              total: desiredNumberScheduled,
              ready: numberReady,
              current: currentNumberScheduled,
              icon: 'server',
            },
          },
        },

        // Status details
        {
          id: 'status',
          data: {
            type: 'info-grid',
            items: [
              { label: 'Update Strategy', value: spec.updateStrategy?.type || 'RollingUpdate' },
              { label: 'Updated', value: `${updatedNumberScheduled}/${desiredNumberScheduled}`, color: 'text-cyan-400' },
              ...(numberMisscheduled > 0 ? [
                { label: 'Misscheduled', value: `${numberMisscheduled} pods on wrong nodes`, color: 'text-red-400' },
              ] : []),
            ],
            columns: 2 as const,
          },
        },
        
        // Labels
        ...(Object.keys(filteredLabels).length > 0 ? [{
          id: 'labels',
          data: {
            type: 'labels' as const,
            labels: filteredLabels,
            title: 'Labels',
          },
        }] : []),
        
        // Annotations
        ...(Object.keys(filteredAnnotations).length > 0 ? [{
          id: 'annotations',
          data: {
            type: 'labels' as const,
            labels: filteredAnnotations,
            title: 'Annotations',
          },
        }] : []),

        // Rolling update config
        ...(spec.updateStrategy?.rollingUpdate ? [{
          id: 'rolling-update',
          title: 'Rolling Update Config',
          data: {
            type: 'info-grid' as const,
            items: [
              { label: 'Max Unavailable', value: String(spec.updateStrategy.rollingUpdate.maxUnavailable ?? 1), color: 'text-amber-400' },
              ...(spec.updateStrategy.rollingUpdate.maxSurge ? [
                { label: 'Max Surge', value: String(spec.updateStrategy.rollingUpdate.maxSurge), color: 'text-cyan-400' },
              ] : []),
            ],
            columns: 2 as const,
          },
        }] : []),

        // Conditions (only problematic ones)
        ...(problematicConditions.length > 0 ? [{
          id: 'conditions',
          title: 'Conditions',
          data: {
            type: 'conditions' as const,
            items: problematicConditions.map(c => ({
              type: c.type || '',
              status: c.status || '',
              reason: c.reason,
              message: c.message,
              isPositive: false,
            })),
          },
        }] : []),

        // Node selector
        ...(spec.template?.spec?.nodeSelector && Object.keys(spec.template.spec.nodeSelector).length > 0 ? [{
          id: 'node-selector',
          title: 'Node Selector',
          data: {
            type: 'node-selector' as const,
            selector: spec.template.spec.nodeSelector,
          },
        }] : []),

        // Container Images
        ...(spec.template?.spec?.containers ? [{
          id: 'images',
          title: 'Container Images',
          data: {
            type: 'container-images' as const,
            containers: spec.template.spec.containers,
          },
        }] : []),
      ],
    };
  },
};
