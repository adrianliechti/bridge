// ReplicaSet Adapter
// Extracts display data from ReplicaSet resources

import { Link } from 'lucide-react';
import type { ResourceAdapter, ResourceSections } from './types';
import type { V1ReplicaSet } from '@kubernetes/client-node';

export const ReplicaSetAdapter: ResourceAdapter<V1ReplicaSet> = {
  kinds: ['ReplicaSet', 'ReplicaSets'],

  adapt(resource): ResourceSections {
    const spec = resource.spec;
    const status = resource.status;
    const metadata = resource.metadata;

    if (!spec) {
      return { sections: [] };
    }

    const desired = spec.replicas ?? 1;
    const current = status?.replicas ?? 0;
    const ready = status?.readyReplicas ?? 0;
    const available = status?.availableReplicas ?? 0;

    // Get owner reference (usually a Deployment)
    const ownerRef = metadata?.ownerReferences?.[0];
    const revision = metadata?.annotations?.['deployment.kubernetes.io/revision'];
    
    // Filter labels (remove internal ones)
    const labels = metadata?.labels ?? {};
    const filteredLabels = Object.fromEntries(
      Object.entries(labels).filter(([key]) => 
        !key.includes('pod-template-hash')
      )
    );
    
    // Filter annotations (remove internal ones)
    const annotations = metadata?.annotations ?? {};
    const filteredAnnotations = Object.fromEntries(
      Object.entries(annotations).filter(([key]) => 
        !key.includes('kubectl.kubernetes.io/last-applied-configuration') &&
        !key.includes('deployment.kubernetes.io/revision')
      )
    );
    
    // Filter conditions to only show problematic ones
    const problematicConditions = (status?.conditions ?? []).filter(c => c.status !== 'True');

    return {
      sections: [
        // Owner reference
        ...(ownerRef ? [{
          id: 'owner',
          data: {
            type: 'custom' as const,
            render: () => (
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                  <Link size={10} /> Owned By
                </div>
                <div className="text-sm flex items-center gap-2">
                  <span className="text-gray-500">{ownerRef.kind}:</span>
                  <span className="text-cyan-400">{ownerRef.name}</span>
                  {revision && (
                    <span className="text-xs bg-gray-700 px-1.5 py-0.5 rounded text-gray-400">
                      rev {revision}
                    </span>
                  )}
                </div>
              </div>
            ),
          },
        }] : []),

        // Replica gauges with pod grid
        {
          id: 'replicas',
          title: 'Replica Status',
          data: {
            type: 'gauges',
            items: [
              { label: 'Ready', current: ready, total: desired, color: 'emerald' },
              { label: 'Current', current: current, total: desired, color: 'blue' },
              { label: 'Available', current: available, total: desired, color: 'cyan' },
            ],
            showPodGrid: {
              total: Math.max(desired, current),
              ready,
              available,
              current,
              icon: 'box',
            },
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

        // Selector
        ...(spec.selector?.matchLabels ? [{
          id: 'selector',
          data: {
            type: 'labels' as const,
            labels: spec.selector.matchLabels,
            title: 'Selector',
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
