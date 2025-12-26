// Node Adapter
// Extracts display data from Node resources

import { Server, Cpu, HardDrive, Box, CheckCircle2, XCircle } from 'lucide-react';
import type { ResourceAdapter, ResourceSections, NodeMetricsData } from './types';
import { formatMemory } from './utils';
import type { V1Node, V1NodeCondition } from '@kubernetes/client-node';
import { 
  getNodeMetrics, 
  parseCpuToNanoCores, 
  parseMemoryToBytes,
  formatCpu,
  formatBytes,
} from '../../api/kubernetesMetrics';

export const NodeAdapter: ResourceAdapter<V1Node> = {
  kinds: ['Node', 'Nodes'],

  adapt(resource): ResourceSections {
    const spec = resource.spec;
    const status = resource.status;
    const metadata = resource.metadata;

    if (!status) {
      return { sections: [] };
    }

    const nodeInfo = status.nodeInfo;
    const conditions = status.conditions ?? [];
    const addresses = status.addresses ?? [];
    const capacity = status.capacity ?? {};
    const allocatable = status.allocatable ?? {};
    const taints = spec?.taints ?? [];
    const labels = metadata?.labels ?? {};

    // Find Ready condition
    const readyCondition = conditions.find(c => c.type === 'Ready');
    const isReady = readyCondition?.status === 'True';

    // Get role from labels
    const roles = Object.keys(labels)
      .filter(k => k.startsWith('node-role.kubernetes.io/'))
      .map(k => k.replace('node-role.kubernetes.io/', ''));

    return {
      sections: [
        // Node status overview
        {
          id: 'status',
          data: {
            type: 'status-cards',
            items: [
              { 
                label: 'Status', 
                value: isReady ? 'Ready' : 'NotReady', 
                status: isReady ? 'success' : 'error',
                icon: isReady ? <CheckCircle2 size={14} /> : <XCircle size={14} />,
              },
              { 
                label: 'Role', 
                value: roles.length > 0 ? roles.join(', ') : 'worker',
                icon: <Server size={14} className="text-purple-400" />,
              },
            ],
          },
        },

        // Resource usage metrics (real-time from metrics-server)
        {
          id: 'metrics',
          data: {
            type: 'node-metrics',
            title: 'Resource Usage',
            loader: async (): Promise<NodeMetricsData | null> => {
              const nodeName = metadata?.name;
              if (!nodeName) return null;

              const metrics = await getNodeMetrics(nodeName);
              if (!metrics) return null;

              const allocatableCpu = allocatable.cpu ?? '0';
              const allocatableMem = allocatable.memory ?? '0';

              return {
                cpu: {
                  usage: formatCpu(parseCpuToNanoCores(metrics.usage.cpu)),
                  usageNanoCores: parseCpuToNanoCores(metrics.usage.cpu),
                  allocatable: allocatableCpu,
                  allocatableNanoCores: parseCpuToNanoCores(allocatableCpu),
                },
                memory: {
                  usage: formatBytes(parseMemoryToBytes(metrics.usage.memory)),
                  usageBytes: parseMemoryToBytes(metrics.usage.memory),
                  allocatable: formatMemory(allocatableMem),
                  allocatableBytes: parseMemoryToBytes(allocatableMem),
                },
              };
            },
          },
        },

        // Addresses
        ...(addresses.length > 0 ? [{
          id: 'addresses',
          title: 'Addresses',
          data: {
            type: 'addresses' as const,
            addresses: addresses.map(a => ({ type: a.type || '', address: a.address || '' })),
          },
        }] : []),

        // Resource capacity
        {
          id: 'resources',
          title: 'Resources',
          data: {
            type: 'capacity-bars',
            items: [
              {
                label: 'CPU',
                icon: <Cpu size={14} className="text-blue-400" />,
                capacity: capacity.cpu ?? '0',
                allocatable: allocatable.cpu ?? '0',
              },
              {
                label: 'Memory',
                icon: <HardDrive size={14} className="text-purple-400" />,
                capacity: formatMemory(capacity.memory ?? '0'),
                allocatable: formatMemory(allocatable.memory ?? '0'),
              },
              {
                label: 'Pods',
                icon: <Box size={14} className="text-emerald-400" />,
                capacity: capacity.pods ?? '0',
                allocatable: allocatable.pods ?? '0',
              },
              ...(capacity['ephemeral-storage'] ? [{
                label: 'Storage',
                icon: <HardDrive size={14} className="text-amber-400" />,
                capacity: formatMemory(capacity['ephemeral-storage']),
                allocatable: formatMemory(allocatable['ephemeral-storage'] ?? '0'),
              }] : []),
            ],
          },
        },

        // Node info
        ...(nodeInfo ? [{
          id: 'system-info',
          title: 'System Info',
          data: {
            type: 'info-grid' as const,
            items: [
              { label: 'OS', value: nodeInfo.operatingSystem },
              { label: 'Arch', value: nodeInfo.architecture },
              { label: 'Kernel', value: nodeInfo.kernelVersion },
              { label: 'OS Image', value: nodeInfo.osImage },
              { label: 'Container Runtime', value: nodeInfo.containerRuntimeVersion },
              { label: 'Kubelet', value: nodeInfo.kubeletVersion },
              { label: 'Kube-Proxy', value: nodeInfo.kubeProxyVersion },
            ],
            columns: 2 as const,
          },
        }] : []),

        // Conditions (only problematic ones)
        ...(() => {
          const problematicConditions = conditions.filter(c => !isNodeConditionPositive(c));
          return problematicConditions.length > 0 ? [{
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
          }] : [];
        })(),

        // Taints
        ...(taints.length > 0 ? [{
          id: 'taints',
          title: 'Taints',
          data: {
            type: 'taints' as const,
            items: taints.map(t => ({
              key: t.key || '',
              value: t.value,
              effect: t.effect || '',
            })),
          },
        }] : []),
      ],
    };
  },
};

// Helper function to determine if a node condition is positive
function isNodeConditionPositive(condition: V1NodeCondition): boolean {
  // For Ready condition, True is good
  // For all other conditions (MemoryPressure, DiskPressure, etc.), False is good
  return condition.type === 'Ready' 
    ? condition.status === 'True'
    : condition.status === 'False';
}
