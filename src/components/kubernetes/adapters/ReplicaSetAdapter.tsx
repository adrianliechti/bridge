// ReplicaSet Adapter
// Extracts display data from ReplicaSet resources

import { createElement } from 'react';
import { Link as LinkIcon } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import type { ResourceAdapter, ResourceSections } from './types';
import type { V1ReplicaSet } from '@kubernetes/client-node';
import { getContainerSections, getResourceQuotaSection } from './utils';
import { getResourceConfig, scaleResource } from '../../../api/kubernetes/kubernetes';
import { createScaleAction } from '../../sections/actionHelpers';

export const ReplicaSetAdapter: ResourceAdapter<V1ReplicaSet> = {
  kinds: ['ReplicaSet', 'ReplicaSets'],

  actions: [
    createScaleAction<V1ReplicaSet>(
      async (context, resource, replicas) => {
        const name = resource.metadata?.name;
        const namespace = resource.metadata?.namespace;
        if (!name || !namespace) throw new Error('ReplicaSet name/namespace missing');
        const config = await getResourceConfig(context, 'replicasets');
        if (!config) throw new Error('Could not get replicaset configuration');
        await scaleResource(context, config, name, replicas, namespace);
      },
      (resource) => resource.spec?.replicas ?? 1,
      { 
        title: 'Scale ReplicaSet',
        description: 'Set the desired number of replicas. Note: If this ReplicaSet is managed by a Deployment, the Deployment may override this change.',
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
    const current = status?.replicas ?? 0;
    const ready = status?.readyReplicas ?? 0;
    const available = status?.availableReplicas ?? 0;

    // Get owner reference (usually a Deployment)
    const ownerRef = metadata?.ownerReferences?.[0];

    // Calculate resource quota from template containers
    const allContainers = [
      ...(spec.template?.spec?.containers ?? []),
      ...(spec.template?.spec?.initContainers ?? []),
    ];
    const quotaSection = getResourceQuotaSection(allContainers);

    // Map owner kind to resource type
    const getResourceType = (kind: string) => {
      const kindMap: Record<string, string> = {
        'Deployment': 'deployments',
        'StatefulSet': 'statefulsets',
        'DaemonSet': 'daemonsets',
        'Job': 'jobs',
      };
      return kindMap[kind] || kind.toLowerCase() + 's';
    };

    return {
      sections: [
        // Owner reference
        ...(ownerRef ? [{
          id: 'owner',
          data: {
            type: 'custom' as const,
            render: () => {
              const content = (
                <div className={`bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 ${
                  namespace ? 'hover:bg-blue-500/15 transition-colors cursor-pointer' : ''
                }`}>
                  <div className="text-xs text-neutral-500 mb-1 flex items-center gap-1">
                    <LinkIcon size={10} /> Owned By
                  </div>
                  <div className="text-sm flex items-center gap-2">
                    <span className="text-neutral-500">{ownerRef.kind}:</span>
                    <span className="text-cyan-400">{ownerRef.name}</span>
                  </div>
                </div>
              );

              return namespace ? (
                <Link
                  to="/cluster/$context/$resourceType/$name"
                  params={{ 
                    context, 
                    resourceType: getResourceType(ownerRef.kind), 
                    name: ownerRef.name 
                  }}
                  search={(prev) => ({ ...prev, namespace })}
                >
                  {content}
                </Link>
              ) : content;
            },
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

        // Resource Quota
        ...(quotaSection ? [quotaSection] : []),

        // Selector
        ...(spec.selector?.matchLabels ? [{
          id: 'selector',
          data: {
            type: 'labels' as const,
            labels: spec.selector.matchLabels,
            title: 'Selector',
          },
        }] : []),

        // Containers
        ...getContainerSections(
          spec.template?.spec?.containers,
          spec.template?.spec?.initContainers,
        ),
      ],
    };
  },
};
