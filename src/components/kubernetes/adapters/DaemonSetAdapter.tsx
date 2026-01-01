// DaemonSet Adapter
// Extracts display data from DaemonSet resources

import type { ResourceAdapter, ResourceSections } from './types';
import type { V1DaemonSet } from '@kubernetes/client-node';
import { getContainerSections, getResourceQuotaSection } from './utils';
import { getPodMetricsBySelector, aggregateContainerMetrics } from '../../../api/kubernetes/kubernetesMetrics';

export const DaemonSetAdapter: ResourceAdapter<V1DaemonSet> = {
  kinds: ['DaemonSet', 'DaemonSets'],

  adapt(context: string, resource): ResourceSections {
    const spec = resource.spec;
    const status = resource.status;
    const metadata = resource.metadata;
    const namespace = metadata?.namespace;

    if (!spec) {
      return { sections: [] };
    }

    const desiredNumberScheduled = status?.desiredNumberScheduled ?? 0;
    const currentNumberScheduled = status?.currentNumberScheduled ?? 0;
    const numberReady = status?.numberReady ?? 0;
    const numberAvailable = status?.numberAvailable ?? 0;
    const numberMisscheduled = status?.numberMisscheduled ?? 0;
    const updatedNumberScheduled = status?.updatedNumberScheduled ?? 0;

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

        // Node selector
        ...(spec.template?.spec?.nodeSelector && Object.keys(spec.template.spec.nodeSelector).length > 0 ? [{
          id: 'node-selector',
          data: {
            type: 'labels' as const,
            labels: spec.template.spec.nodeSelector,
            title: 'Node Selector',
          },
        }] : []),

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
