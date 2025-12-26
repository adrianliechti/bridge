// StatefulSet Adapter
// Extracts display data from StatefulSet resources

import type { ResourceAdapter, ResourceSections, PVCData } from './types';
import { getResourceList, getResourceConfig } from '../../api/kubernetes';
import type { V1StatefulSet } from '@kubernetes/client-node';
import { getStandardMetadataSections } from './utils';

export const StatefulSetAdapter: ResourceAdapter<V1StatefulSet> = {
  kinds: ['StatefulSet', 'StatefulSets'],

  adapt(resource, namespace): ResourceSections {
    const spec = resource.spec;
    const status = resource.status;
    const metadata = resource.metadata;

    if (!spec) {
      return { sections: [] };
    }

    const desired = spec.replicas ?? 1;
    const ready = status?.readyReplicas ?? 0;
    const current = status?.currentReplicas ?? 0;
    const updated = status?.updatedReplicas ?? 0;
    const available = status?.availableReplicas ?? 0;

    // Generate pod titles for ordinal display
    const podTitles = Array.from({ length: desired }, (_, i) => `${metadata?.name}-${i}`);
    
    // Filter conditions to only show problematic ones
    const problematicConditions = (status?.conditions ?? []).filter(c => c.status !== 'True');

    return {
      sections: [
        // Replica gauges with ordinal pod grid
        {
          id: 'replicas',
          title: 'Replica Status',
          data: {
            type: 'gauges',
            items: [
              { label: 'Ready', current: ready, total: desired, color: 'emerald' },
              { label: 'Current', current: current, total: desired, color: 'blue' },
              { label: 'Updated', current: updated, total: desired, color: 'cyan' },
            ],
            showPodGrid: {
              total: desired,
              ready,
              available,
              showOrdinal: true,
              icon: 'database',
              podTitles,
            },
          },
        },

        // StatefulSet config
        {
          id: 'config',
          data: {
            type: 'info-grid',
            items: [
              { label: 'Service Name', value: spec.serviceName, color: 'text-cyan-400' },
              { label: 'Pod Management', value: spec.podManagementPolicy || 'OrderedReady' },
              { label: 'Update Strategy', value: spec.updateStrategy?.type || 'RollingUpdate' },
              ...(spec.updateStrategy?.rollingUpdate?.partition !== undefined ? [
                { label: 'Partition', value: spec.updateStrategy.rollingUpdate.partition, color: 'text-amber-400' },
              ] : []),
            ],
            columns: 2,
          },
        },
        
        // Labels and Annotations
        ...getStandardMetadataSections(metadata),

        // Revision info
        ...(status?.currentRevision ? [{
          id: 'revisions',
          title: 'Revisions',
          data: {
            type: 'info-grid' as const,
            items: [
              { label: 'Current', value: status.currentRevision, color: 'text-cyan-400' },
              ...(status.updateRevision && status.updateRevision !== status.currentRevision ? [
                { label: 'Update', value: status.updateRevision, color: 'text-amber-400' },
              ] : []),
            ],
            columns: 1 as const,
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

        // Volume Claim Templates
        ...(spec.volumeClaimTemplates?.length ? [{
          id: 'volume-templates',
          title: 'Volume Claim Templates',
          data: {
            type: 'volume-claim-templates' as const,
            items: spec.volumeClaimTemplates.map(template => ({
              name: template.metadata?.name || '',
              size: template.spec?.resources?.requests?.storage as string | undefined,
              storageClass: template.spec?.storageClassName,
              accessModes: template.spec?.accessModes,
            })),
          },
        }] : []),

        // Associated PVCs (async loaded)
        {
          id: 'pvcs',
          title: 'Persistent Volume Claims',
          data: {
            type: 'related-pvcs',
            loader: async (): Promise<PVCData[]> => {
              if (!namespace || !metadata?.name) return [];
              
              try {
                const pvcConfig = await getResourceConfig('persistentvolumeclaims');
                if (!pvcConfig) return [];
                
                const pvcs = await getResourceList(pvcConfig, namespace);
                const stsName = metadata.name;
                const claimTemplates = spec?.volumeClaimTemplates?.map(t => t.metadata?.name) ?? [];
                
                return pvcs
                  .filter(pvc => {
                    const meta = pvc.metadata as Record<string, unknown>;
                    const pvcName = meta.name as string;
                    
                    // Check if PVC matches any volume claim template pattern
                    return claimTemplates.some(claimName => 
                      pvcName.startsWith(`${claimName}-${stsName}-`)
                    );
                  })
                  .map(pvc => {
                    const meta = pvc.metadata as Record<string, unknown>;
                    const pvcSpec = pvc.spec as Record<string, unknown>;
                    const pvcStatus = pvc.status as Record<string, unknown>;
                    
                    return {
                      name: meta.name as string,
                      status: pvcStatus?.phase as string ?? 'Unknown',
                      capacity: (pvcStatus?.capacity as Record<string, string>)?.storage,
                      storageClass: pvcSpec?.storageClassName as string,
                    };
                  });
              } catch (error) {
                console.error('Failed to fetch PVCs:', error);
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
