import { useState } from 'react';
import { Server, Cpu, HardDrive, Box, ChevronDown, ChevronRight, CheckCircle2, AlertTriangle, XCircle, Tag } from 'lucide-react';
import { registerVisualizer, type ResourceVisualizerProps } from './Visualizer';
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
        <ConditionsSection conditions={conditions} />
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

// Helper components

function StatusCard({ 
  label, 
  value, 
  status,
  icon
}: { 
  label: string; 
  value: string; 
  status?: 'success' | 'warning' | 'error' | 'neutral';
  icon?: React.ReactNode;
}) {
  const statusColors = {
    success: 'text-emerald-400',
    warning: 'text-amber-400',
    error: 'text-red-400',
    neutral: 'text-gray-100',
  };

  return (
    <div className="bg-gray-900/50 rounded-lg p-3">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-sm font-medium flex items-center gap-2 ${statusColors[status || 'neutral']}`}>
        {icon}
        {value}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="overflow-hidden">
      <span className="text-gray-500">{label}:</span>{' '}
      <span className="text-gray-300 truncate">{value}</span>
    </div>
  );
}

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

function ConditionsSection({ conditions }: { conditions: V1NodeCondition[] }) {
  const [expanded, setExpanded] = useState(true);

  // Sort conditions to show important ones first
  const sortedConditions = [...conditions].sort((a, b) => {
    const order = ['Ready', 'MemoryPressure', 'DiskPressure', 'PIDPressure', 'NetworkUnavailable'];
    return order.indexOf(a.type ?? '') - order.indexOf(b.type ?? '');
  });

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs font-medium text-gray-500 uppercase tracking-wider mb-2 hover:text-gray-300 transition-colors"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        Conditions ({conditions.length})
      </button>
      {expanded && (
        <div className="space-y-1">
          {sortedConditions.map((condition, i) => {
            const isGood = condition.type === 'Ready' 
              ? condition.status === 'True'
              : condition.status === 'False';
            
            return (
              <div 
                key={i} 
                className={`flex items-start gap-2 text-xs px-2 py-1.5 rounded ${
                  isGood
                    ? 'bg-emerald-500/10 border border-emerald-500/20' 
                    : 'bg-red-500/10 border border-red-500/20'
                }`}
              >
                {isGood ? (
                  <CheckCircle2 size={12} className="text-emerald-400 mt-0.5 shrink-0" />
                ) : (
                  <AlertTriangle size={12} className="text-red-400 mt-0.5 shrink-0" />
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-300">{condition.type}</span>
                    <span className={isGood ? 'text-emerald-400' : 'text-red-400'}>
                      {condition.status}
                    </span>
                  </div>
                  {condition.reason && (
                    <div className="text-gray-500">{condition.reason}</div>
                  )}
                  {condition.message && (
                    <div className="text-gray-500 text-[10px] truncate">{condition.message}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TaintsSection({ taints }: { taints: V1Taint[] }) {
  const [expanded, setExpanded] = useState(false);

  const effectColors: Record<string, string> = {
    'NoSchedule': 'bg-red-500/20 text-red-400 border-red-500/30',
    'PreferNoSchedule': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    'NoExecute': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  };

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs font-medium text-gray-500 uppercase tracking-wider mb-2 hover:text-gray-300 transition-colors"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <AlertTriangle size={12} className="text-amber-400" />
        Taints ({taints.length})
      </button>
      {expanded && (
        <div className="space-y-1">
          {taints.map((taint, i) => (
            <div 
              key={i} 
              className="flex items-center gap-2 text-xs bg-gray-900/50 px-2 py-1.5 rounded"
            >
              <span className="text-purple-400">{taint.key}</span>
              {taint.value && (
                <>
                  <span className="text-gray-600">=</span>
                  <span className="text-cyan-400">{taint.value}</span>
                </>
              )}
              <span className="text-gray-600">:</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] border ${effectColors[taint.effect ?? ''] ?? 'bg-gray-700 text-gray-300'}`}>
                {taint.effect}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LabelsSection({ labels }: { labels: Record<string, string> }) {
  const [expanded, setExpanded] = useState(false);

  // Filter out some common/noisy labels for the collapsed view
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

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs font-medium text-gray-500 uppercase tracking-wider mb-2 hover:text-gray-300 transition-colors"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Tag size={12} />
        Labels ({entries.length})
      </button>
      
      {/* Always show important labels */}
      {importantLabels.length > 0 && (
        <div className="space-y-1 mb-2">
          {importantLabels.map(([key, value]) => (
            <div key={key} className="text-xs bg-gray-900/50 px-2 py-1.5 rounded">
              <span className="text-purple-400">{key}</span>
              {value && (
                <>
                  <span className="text-gray-600 mx-1">=</span>
                  <span className="text-cyan-400">{value}</span>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Show other labels when expanded */}
      {expanded && otherLabels.length > 0 && (
        <div className="space-y-1 border-t border-gray-800 pt-2">
          {otherLabels.map(([key, value]) => (
            <div key={key} className="text-xs bg-gray-900/50 px-2 py-1.5 rounded">
              <span className="text-purple-400">{key}</span>
              {value && (
                <>
                  <span className="text-gray-600 mx-1">=</span>
                  <span className="text-cyan-400">{value}</span>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Helper functions

function formatMemory(value: string): string {
  // Handle Ki, Mi, Gi suffixes
  const match = value.match(/^(\d+)(Ki|Mi|Gi|Ti|K|M|G|T)?$/);
  if (!match) return value;
  
  const num = parseInt(match[1], 10);
  const unit = match[2];
  
  if (!unit) {
    // Bytes
    if (num >= 1024 * 1024 * 1024) return `${(num / (1024 * 1024 * 1024)).toFixed(1)}Gi`;
    if (num >= 1024 * 1024) return `${(num / (1024 * 1024)).toFixed(1)}Mi`;
    if (num >= 1024) return `${(num / 1024).toFixed(1)}Ki`;
    return `${num}B`;
  }
  
  // Already has unit - convert to more readable format if large
  if (unit === 'Ki' && num >= 1024 * 1024) return `${(num / (1024 * 1024)).toFixed(1)}Gi`;
  if (unit === 'Ki' && num >= 1024) return `${(num / 1024).toFixed(1)}Mi`;
  if (unit === 'Mi' && num >= 1024) return `${(num / 1024).toFixed(1)}Gi`;
  
  return value;
}
