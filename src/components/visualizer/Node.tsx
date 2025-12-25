import { Server, Cpu, HardDrive, Box, AlertTriangle, Tag, CheckCircle2, XCircle } from 'lucide-react';
import { registerVisualizer, type ResourceVisualizerProps } from './Visualizer';
import { StatusCard, InfoRow, ConditionsSection } from './shared';
import { formatMemory } from './utils';
import type { V1Node, V1NodeCondition, V1Taint } from '@kubernetes/client-node';

export function NodeVisualizer({ resource }: ResourceVisualizerProps) {
  const node = resource as unknown as V1Node;
  const spec = node.spec;
  const status = node.status;
  const metadata = node.metadata;

  if (!status) {
    return <div className="text-gray-500 text-sm">No node status available</div>;
  }

  const nodeInfo = status.nodeInfo;
  const conditions = status.conditions ?? [];
  const addresses = status.addresses ?? [];
  const capacity = status.capacity ?? {};
  const allocatable = status.allocatable ?? {};
  const taints = spec?.taints ?? [];

  // Find Ready condition
  const readyCondition = conditions.find(c => c.type === 'Ready');
  const isReady = readyCondition?.status === 'True';

  // Get role from labels
  const labels = metadata?.labels ?? {};
  const roles = Object.keys(labels)
    .filter(k => k.startsWith('node-role.kubernetes.io/'))
    .map(k => k.replace('node-role.kubernetes.io/', ''));

  return (
    <div className="space-y-4">
      {/* Node Status Overview */}
      <div className="grid grid-cols-2 gap-3">
        <StatusCard 
          label="Status" 
          value={isReady ? 'Ready' : 'NotReady'} 
          status={isReady ? 'success' : 'error'}
          icon={isReady ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
        />
        <StatusCard 
          label="Role" 
          value={roles.length > 0 ? roles.join(', ') : 'worker'} 
          icon={<Server size={14} className="text-purple-400" />}
        />
      </div>

      {/* Addresses */}
      <div>
        <h5 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
          Addresses
        </h5>
        <div className="grid grid-cols-2 gap-2">
          {addresses.map((addr, i) => (
            <div key={i} className="bg-gray-900/50 rounded-lg p-2">
              <div className="text-xs text-gray-500">{addr.type}</div>
              <div className="text-sm text-cyan-400 font-mono">{addr.address}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Resource Capacity */}
      <div>
        <h5 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
          Resources
        </h5>
        <div className="space-y-3">
          <ResourceBar 
            label="CPU"
            icon={<Cpu size={14} className="text-blue-400" />}
            capacity={capacity.cpu ?? '0'}
            allocatable={allocatable.cpu ?? '0'}
          />
          <ResourceBar 
            label="Memory"
            icon={<HardDrive size={14} className="text-purple-400" />}
            capacity={formatMemory(capacity.memory ?? '0')}
            allocatable={formatMemory(allocatable.memory ?? '0')}
          />
          <ResourceBar 
            label="Pods"
            icon={<Box size={14} className="text-emerald-400" />}
            capacity={capacity.pods ?? '0'}
            allocatable={allocatable.pods ?? '0'}
          />
          {capacity['ephemeral-storage'] && (
            <ResourceBar 
              label="Storage"
              icon={<HardDrive size={14} className="text-amber-400" />}
              capacity={formatMemory(capacity['ephemeral-storage'])}
              allocatable={formatMemory(allocatable['ephemeral-storage'] ?? '0')}
            />
          )}
        </div>
      </div>

      {/* Node Info */}
      {nodeInfo && (
        <div>
          <h5 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
            System Info
          </h5>
          <div className="bg-gray-900/50 rounded-lg p-3 grid grid-cols-2 gap-2 text-xs">
            <InfoRow label="OS" value={nodeInfo.operatingSystem} />
            <InfoRow label="Arch" value={nodeInfo.architecture} />
            <InfoRow label="Kernel" value={nodeInfo.kernelVersion} />
            <InfoRow label="OS Image" value={nodeInfo.osImage} />
            <InfoRow label="Container Runtime" value={nodeInfo.containerRuntimeVersion} />
            <InfoRow label="Kubelet" value={nodeInfo.kubeletVersion} />
            <InfoRow label="Kube-Proxy" value={nodeInfo.kubeProxyVersion} />
          </div>
        </div>
      )}

      {/* Conditions */}
      {conditions.length > 0 && (
        <ConditionsSection 
          conditions={sortNodeConditions(conditions)}
          isPositive={isNodeConditionPositive}
        />
      )}

      {/* Taints */}
      {taints.length > 0 && (
        <TaintsSection taints={taints} />
      )}

      {/* Key Labels */}
      <LabelsSection labels={labels} />
    </div>
  );
}

// Register this visualizer
registerVisualizer('Node', NodeVisualizer);
registerVisualizer('Nodes', NodeVisualizer);

// Helper function to determine if a node condition is positive
function isNodeConditionPositive(condition: V1NodeCondition): boolean {
  // For Ready condition, True is good
  // For all other conditions (MemoryPressure, DiskPressure, etc.), False is good
  return condition.type === 'Ready' 
    ? condition.status === 'True'
    : condition.status === 'False';
}

// Helper function to sort node conditions
function sortNodeConditions(conditions: V1NodeCondition[]): V1NodeCondition[] {
  const order = ['Ready', 'MemoryPressure', 'DiskPressure', 'PIDPressure', 'NetworkUnavailable'];
  return [...conditions].sort((a, b) => 
    order.indexOf(a.type ?? '') - order.indexOf(b.type ?? '')
  );
}

// Helper components

function ResourceBar({ 
  label, 
  icon, 
  capacity, 
  allocatable 
}: { 
  label: string; 
  icon: React.ReactNode;
  capacity: string; 
  allocatable: string;
}) {
  return (
    <div className="bg-gray-900/50 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-sm text-gray-300">
          {icon}
          {label}
        </div>
        <div className="text-xs">
          <span className="text-cyan-400">{allocatable}</span>
          <span className="text-gray-500"> / </span>
          <span className="text-gray-400">{capacity}</span>
        </div>
      </div>
      <div className="text-[10px] text-gray-500 flex justify-between">
        <span>Allocatable</span>
        <span>Capacity</span>
      </div>
    </div>
  );
}

function TaintsSection({ taints }: { taints: V1Taint[] }) {
  const effectColors: Record<string, string> = {
    'NoSchedule': 'bg-red-500/20 text-red-400 border-red-500/30',
    'PreferNoSchedule': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    'NoExecute': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  };

  return (
    <div>
      <h5 className="flex items-center gap-2 text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
        <AlertTriangle size={12} className="text-amber-400" />
        Taints ({taints.length})
      </h5>
      <div className="flex flex-wrap gap-1">
        {taints.map((taint, i) => (
          <span 
            key={i} 
            className="text-xs bg-gray-200 dark:bg-gray-700 px-2 py-0.5 rounded flex items-center gap-1"
            title={`${taint.key}=${taint.value || ''}:${taint.effect}`}
          >
            <span className="text-purple-600 dark:text-purple-400">{taint.key}</span>
            {taint.value && (
              <>
                <span className="text-gray-400">=</span>
                <span className="text-cyan-600 dark:text-cyan-400">{taint.value}</span>
              </>
            )}
            <span className={`ml-1 px-1 py-0.5 rounded text-[10px] border ${effectColors[taint.effect ?? ''] ?? 'bg-gray-700 text-gray-300'}`}>
              {taint.effect}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function LabelsSection({ labels }: { labels: Record<string, string> }) {
  // Filter out some common/noisy labels
  const importantPrefixes = [
    'node-role.kubernetes.io/',
    'kubernetes.io/os',
    'kubernetes.io/arch',
    'node.kubernetes.io/instance-type',
    'topology.kubernetes.io/',
  ];

  const entries = Object.entries(labels);
  const importantLabels = entries.filter(([k]) => 
    importantPrefixes.some(p => k.startsWith(p))
  );
  const otherLabels = entries.filter(([k]) => 
    !importantPrefixes.some(p => k.startsWith(p))
  );

  const allLabels = [...importantLabels, ...otherLabels];

  return (
    <div>
      <h5 className="flex items-center gap-2 text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
        <Tag size={12} />
        Labels
      </h5>
      <table className="w-full text-xs">
        <tbody>
          {allLabels.map(([key, value]) => {
            const isImportant = importantPrefixes.some(p => key.startsWith(p));
            return (
              <tr key={key} className="border-b border-gray-200 dark:border-gray-700/50 last:border-0">
                <td className={`py-1.5 pr-3 align-top whitespace-nowrap ${isImportant ? 'text-blue-600 dark:text-blue-400' : 'text-sky-600 dark:text-sky-400'}`}>
                  {key}
                </td>
                <td className="py-1.5 text-emerald-600 dark:text-emerald-400 break-all">
                  {value}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
