// Deployment Adapter
// Extracts display data from Deployment resources

import type { ResourceAdapter, ResourceSections, ReplicaSetData } from './types';
import { getResourceList, getResourceConfig } from '../../api/kubernetes';
import type { V1Deployment } from '@kubernetes/client-node';
import { getStandardMetadataSections } from './utils';

export const DeploymentAdapter: ResourceAdapter<V1Deployment> = {
  kinds: ['Deployment', 'Deployments'],

  adapt(resource, namespace): ResourceSections {
    const spec = resource.spec;
    const status = resource.status;
    const metadata = resource.metadata;

    if (!spec) {
      return { sections: [] };
    }

    const desired = spec.replicas ?? 1;
    const ready = status?.readyReplicas ?? 0;
    const updated = status?.updatedReplicas ?? 0;
    const available = status?.availableReplicas ?? 0;
    
    // Filter conditions to only show problematic ones
    const problematicConditions = (status?.conditions ?? []).filter(c => c.status !== 'True');

    return {
      sections: [
        // Replica gauges with pod grid
        {
          id: 'replicas',
          title: 'Replica Status',
          data: {
            type: 'gauges',
            items: [
              { label: 'Ready', current: ready, total: desired, color: 'emerald' },
              { label: 'Updated', current: updated, total: desired, color: 'blue' },
              { label: 'Available', current: available, total: desired, color: 'cyan' },
            ],
            showPodGrid: {
              total: desired,
              ready,
              available,
              icon: 'box',
            },
          },
        },

        // Strategy info
        {
          id: 'strategy',
          data: {
            type: 'info-grid',
            items: [
              { label: 'Strategy', value: spec.strategy?.type || 'RollingUpdate' },
              ...(spec.strategy?.rollingUpdate ? [
                { label: 'Max Surge', value: String(spec.strategy.rollingUpdate.maxSurge ?? '25%'), color: 'text-cyan-400' },
                { label: 'Max Unavailable', value: String(spec.strategy.rollingUpdate.maxUnavailable ?? '25%'), color: 'text-amber-400' },
              ] : []),
            ],
            columns: 2,
          },
        },
        
        // Labels and Annotations
        ...getStandardMetadataSections(metadata),

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

        // Related ReplicaSets (async loaded)
        {
          id: 'replicasets',
          title: 'ReplicaSets',
          data: {
            type: 'related-replicasets',
            loader: async (): Promise<ReplicaSetData[]> => {
              if (!namespace || !metadata?.name) return [];
              
              try {
                const rsConfig = await getResourceConfig('replicasets');
                if (!rsConfig) return [];
                
                const rsList = await getResourceList(rsConfig, namespace);
                const deploymentName = metadata.name ?? '';
                const deploymentUid = metadata.uid;
                
                return rsList
                  .filter(rs => {
                    const meta = rs.metadata as Record<string, unknown>;
                    const rsName = meta.name as string;
                    
                    // Check ownerReferences
                    const refs = meta.ownerReferences as Array<{ name: string; uid: string; kind?: string }> | undefined;
                    if (refs?.some(ref => (ref.kind === 'Deployment' && ref.name === deploymentName) || ref.uid === deploymentUid)) {
                      return true;
                    }
                    
                    // Fallback: match by name prefix
                    if (rsName.startsWith(deploymentName + '-')) {
                      const suffix = rsName.slice(deploymentName.length + 1);
                      return /^[a-z0-9]{7,10}$/.test(suffix);
                    }
                    
                    return false;
                  })
                  .map(rs => {
                    const meta = rs.metadata as Record<string, unknown>;
                    const rsSpec = rs.spec as { template?: { spec?: { containers?: Array<{ image: string }> } } };
                    const rsStatus = rs.status as { replicas?: number; readyReplicas?: number };
                    const annotations = meta.annotations as Record<string, string> | undefined;
                    
                    return {
                      name: meta.name as string,
                      replicas: rsStatus?.replicas ?? 0,
                      readyReplicas: rsStatus?.readyReplicas ?? 0,
                      revision: annotations?.['deployment.kubernetes.io/revision'],
                      images: rsSpec?.template?.spec?.containers?.map(c => c.image) ?? [],
                      isCurrent: (rsStatus?.replicas ?? 0) > 0,
                    };
                  })
                  .sort((a, b) => {
                    const revA = parseInt(a.revision ?? '0');
                    const revB = parseInt(b.revision ?? '0');
                    return revB - revA;
                  });
              } catch (error) {
                console.error('Failed to fetch ReplicaSets:', error);
                return [];
              }
            },
          },
        },

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
