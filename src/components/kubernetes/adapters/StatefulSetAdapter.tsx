// StatefulSet Adapter
// Extracts display data from StatefulSet resources

import type { ResourceAdapter, ResourceSections, PVCData } from './types';
import { getResourceList, getResourceConfig, restartWorkload, scaleResource } from '../../../api/kubernetes/kubernetes';
import type { V1StatefulSet } from '@kubernetes/client-node';
import { getContainerSections, getResourceQuotaSection } from './utils';
import { getPodMetricsBySelector, aggregateContainerMetrics } from '../../../api/kubernetes/kubernetesMetrics';
import { createScaleAction, createRestartAction } from '../../sections/actionHelpers';

export const StatefulSetAdapter: ResourceAdapter<V1StatefulSet> = {
  kinds: ['StatefulSet', 'StatefulSets'],

  actions: [
    createScaleAction<V1StatefulSet>(
      async (context, resource, replicas) => {
        const name = resource.metadata?.name;
        const namespace = resource.metadata?.namespace;
        if (!name || !namespace) throw new Error('StatefulSet name/namespace missing');
        const config = await getResourceConfig(context, 'statefulsets');
        if (!config) throw new Error('Could not get statefulset configuration');
        await scaleResource(context, config, name, replicas, namespace);
      },
      (resource) => resource.spec?.replicas ?? 1,
      { title: 'Scale StatefulSet' }
    ),
    createRestartAction<V1StatefulSet>(
      async (context, resource) => {
        const name = resource.metadata?.name;
        const namespace = resource.metadata?.namespace;
        if (!name || !namespace) throw new Error('StatefulSet name/namespace missing');
        const config = await getResourceConfig(context, 'statefulsets');
        if (!config) throw new Error('Could not get statefulset configuration');
        await restartWorkload(context, config, name, namespace);
      }
    ),
  ],

  adapt(context: string, resource): ResourceSections {
    const spec = resource.spec;
    const status = resource.status;
    const metadata = resource.metadata;
    const namespace = metadata?.namespace;

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

    // Create metrics loader for container metrics
    const metricsLoader = async () => {
      const matchLabels = spec.selector?.matchLabels;
      if (!namespace || !matchLabels || Object.keys(matchLabels).length === 0) return null;

      const podMetrics = await getPodMetricsBySelector(context, namespace, matchLabels);
      if (podMetrics.length === 0) return null;

      return aggregateContainerMetrics(podMetrics);
    };

    // Calculate resource quota from template containers
    const allContainers = [
      ...(spec.template?.spec?.containers ?? []),
      ...(spec.template?.spec?.initContainers ?? []),
    ];
    const quotaSection = getResourceQuotaSection(allContainers);

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
          data: {
            type: 'related-pvcs',
            title: 'Persistent Volume Claims',
            loader: async (): Promise<PVCData[]> => {
              if (!namespace || !metadata?.name) return [];
              
              try {
                const pvcConfig = await getResourceConfig(context, 'persistentvolumeclaims');
                if (!pvcConfig) return [];
                
                const pvcs = await getResourceList(context, pvcConfig, namespace);
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
                      namespace,
                      context,
                    };
                  });
              } catch (error) {
                console.error('Failed to fetch PVCs:', error);
                return [];
              }
            },
          },
        },

        // Containers with live metrics
        ...getContainerSections(
          spec.template?.spec?.containers,
          spec.template?.spec?.initContainers,
          metricsLoader,
        ),

        // Resource Quota
        ...(quotaSection ? [quotaSection] : []),
      ],
    };
  },
};
