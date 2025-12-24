import { useState, useEffect } from 'react';
import { HardDrive, Database, Link, ArrowRight } from 'lucide-react';
import { registerVisualizer, type ResourceVisualizerProps } from './Visualizer';
import { getResourceTable } from '../../api/kubernetesTable';
import { getResourceConfig } from '../../api/kubernetes';
import type { V1PersistentVolumeClaim, V1PersistentVolumeClaimCondition } from '@kubernetes/client-node';

interface PVInfo {
  name: string;
  capacity?: string;
  storageClass?: string;
  reclaimPolicy?: string;
  source?: string;
}

export function PersistentVolumeClaimVisualizer({ resource }: ResourceVisualizerProps) {
  const pvc = resource as unknown as V1PersistentVolumeClaim;
  const spec = pvc.spec;
  const status = pvc.status;
  const [pvInfo, setPvInfo] = useState<PVInfo | null>(null);
  const [loadingPv, setLoadingPv] = useState(true);

  // Fetch bound PV info
  useEffect(() => {
    async function fetchPV() {
      const volumeName = spec?.volumeName;
      if (!volumeName) {
        setLoadingPv(false);
        return;
      }
      
      try {
        const pvConfig = await getResourceConfig('persistentvolumes');
        if (!pvConfig) {
          console.warn('PV resource config not found');
          return;
        }
        
        const response = await getResourceTable(pvConfig);

        const pv = response.rows.find(row => {
          const obj = row.object as Record<string, unknown>;
          const meta = obj.metadata as Record<string, unknown>;
          return meta.name === volumeName;
        });

        if (pv) {
          const obj = pv.object as Record<string, unknown>;
          const pvSpec = obj.spec as Record<string, unknown>;
          
          setPvInfo({
            name: volumeName,
            capacity: (pvSpec?.capacity as Record<string, string>)?.storage,
            storageClass: pvSpec?.storageClassName as string,
            reclaimPolicy: pvSpec?.persistentVolumeReclaimPolicy as string,
            source: getPVSource(pvSpec),
          });
        }
      } catch (error) {
        console.error('Failed to fetch PV:', error);
      } finally {
        setLoadingPv(false);
      }
    }

    fetchPV();
  }, [spec?.volumeName]);

  if (!spec) {
    return <div className="text-gray-500 text-sm">No PVC spec available</div>;
  }

  const phase = status?.phase ?? 'Unknown';
  const requestedStorage = spec.resources?.requests?.storage ?? 'Unknown';
  const actualCapacity = status?.capacity?.storage;

  return (
    <div className="space-y-4">
      {/* Status Overview */}
      <div className="grid grid-cols-2 gap-3">
        <StatusCard 
          label="Phase" 
          value={phase} 
          status={getPhaseStatus(phase)}
        />
        <StatusCard 
          label="Requested" 
          value={requestedStorage} 
          icon={<HardDrive size={14} className="text-purple-400" />}
        />
        {actualCapacity && (
          <StatusCard 
            label="Actual Capacity" 
            value={actualCapacity} 
            icon={<HardDrive size={14} className="text-emerald-400" />}
          />
        )}
        <StatusCard 
          label="Volume Mode" 
          value={spec.volumeMode ?? 'Filesystem'} 
        />
      </div>

      {/* Access Modes */}
      {spec.accessModes && spec.accessModes.length > 0 && (
        <div>
          <h5 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
            Access Modes
          </h5>
          <div className="flex flex-wrap gap-2">
            {spec.accessModes.map((mode, i) => (
              <span 
                key={i} 
                className={`text-xs px-2 py-1 rounded ${getAccessModeStyle(mode)}`}
              >
                {formatAccessMode(mode)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Storage Class */}
      {spec.storageClassName && (
        <div className="bg-gray-900/50 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">Storage Class</div>
          <div className="text-sm text-purple-400 flex items-center gap-2">
            <Database size={14} />
            {spec.storageClassName}
          </div>
        </div>
      )}

      {/* Bound Volume */}
      {spec.volumeName && (
        <div className={`rounded-lg p-3 ${
          phase === 'Bound' 
            ? 'bg-emerald-500/10 border border-emerald-500/30' 
            : 'bg-gray-900/50 border border-gray-700'
        }`}>
          <div className="text-xs text-gray-500 mb-2 flex items-center gap-1">
            <Link size={10} /> Bound Volume
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-cyan-400">{spec.volumeName}</span>
          </div>
          
          {loadingPv ? (
            <div className="text-xs text-gray-500 mt-2">Loading volume details...</div>
          ) : pvInfo && (
            <div className="mt-3 pt-3 border-t border-gray-700/50">
              <div className="grid grid-cols-2 gap-2 text-xs">
                {pvInfo.capacity && (
                  <div>
                    <span className="text-gray-500">Capacity:</span>{' '}
                    <span className="text-emerald-400">{pvInfo.capacity}</span>
                  </div>
                )}
                {pvInfo.reclaimPolicy && (
                  <div>
                    <span className="text-gray-500">Reclaim:</span>{' '}
                    <span className={pvInfo.reclaimPolicy === 'Delete' ? 'text-red-400' : 'text-amber-400'}>
                      {pvInfo.reclaimPolicy}
                    </span>
                  </div>
                )}
                {pvInfo.source && (
                  <div className="col-span-2">
                    <span className="text-gray-500">Source:</span>{' '}
                    <span className="text-purple-400">{pvInfo.source}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Volume Binding Diagram */}
      <div>
        <h5 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
          Binding
        </h5>
        <div className="bg-gray-900/50 rounded-lg p-3">
          <div className="flex items-center justify-center gap-3">
            <div className={`flex flex-col items-center p-2 rounded ${
              phase === 'Bound' ? 'bg-emerald-500/10' : 'bg-amber-500/10'
            }`}>
              <HardDrive size={20} className={phase === 'Bound' ? 'text-emerald-400' : 'text-amber-400'} />
              <span className="text-xs text-gray-400 mt-1">PVC</span>
              <span className="text-xs text-gray-300">{requestedStorage}</span>
            </div>
            
            <ArrowRight size={20} className={phase === 'Bound' ? 'text-emerald-400' : 'text-gray-600'} />
            
            <div className={`flex flex-col items-center p-2 rounded ${
              spec.volumeName ? 'bg-cyan-500/10' : 'bg-gray-700/50'
            }`}>
              <Database size={20} className={spec.volumeName ? 'text-cyan-400' : 'text-gray-500'} />
              <span className="text-xs text-gray-400 mt-1">PV</span>
              <span className="text-xs text-gray-300">
                {pvInfo?.capacity ?? (spec.volumeName ? '...' : 'None')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Selector */}
      {spec.selector && (
        <div>
          <h5 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
            Selector
          </h5>
          <div className="bg-gray-900/50 rounded-lg p-3 space-y-2">
            {spec.selector.matchLabels && Object.entries(spec.selector.matchLabels).map(([key, value]) => (
              <div key={key} className="text-xs">
                <span className="text-purple-400">{key}</span>
                <span className="text-gray-600 mx-1">=</span>
                <span className="text-cyan-400">{value}</span>
              </div>
            ))}
            {spec.selector.matchExpressions?.map((expr, i) => (
              <div key={i} className="text-xs">
                <span className="text-purple-400">{expr.key}</span>
                <span className="text-gray-500 mx-1">{expr.operator}</span>
                {expr.values && (
                  <span className="text-cyan-400">{expr.values.join(', ')}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Conditions */}
      {status?.conditions && status.conditions.length > 0 && (
        <ConditionsSection conditions={status.conditions} />
      )}

      {/* Data Source (for cloning) */}
      {spec.dataSource && (
        <div className="bg-gray-900/50 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">Data Source</div>
          <div className="text-xs">
            <span className="text-gray-500">Kind:</span>{' '}
            <span className="text-purple-400">{spec.dataSource.kind}</span>
            <span className="mx-2 text-gray-600">|</span>
            <span className="text-gray-500">Name:</span>{' '}
            <span className="text-cyan-400">{spec.dataSource.name}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// Register this visualizer
registerVisualizer('PersistentVolumeClaim', PersistentVolumeClaimVisualizer);
registerVisualizer('PersistentVolumeClaims', PersistentVolumeClaimVisualizer);

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

function ConditionsSection({ conditions }: { conditions: V1PersistentVolumeClaimCondition[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs font-medium text-gray-500 uppercase tracking-wider mb-2 hover:text-gray-300 transition-colors"
      >
        {expanded ? '▼' : '▶'} Conditions ({conditions.length})
      </button>
      {expanded && (
        <div className="space-y-1">
          {conditions.map((condition, i) => (
            <div 
              key={i} 
              className={`flex items-start gap-2 text-xs px-2 py-1.5 rounded ${
                condition.status === 'True' 
                  ? 'bg-emerald-500/10 border border-emerald-500/20' 
                  : 'bg-gray-900/50 border border-gray-700'
              }`}
            >
              <div>
                <div className="text-gray-300">{condition.type}</div>
                {condition.reason && (
                  <div className="text-gray-500">{condition.reason}</div>
                )}
                {condition.message && (
                  <div className="text-gray-500 text-[10px] mt-1">{condition.message}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Helper functions

function getPhaseStatus(phase: string): 'success' | 'warning' | 'error' | 'neutral' {
  switch (phase.toLowerCase()) {
    case 'bound': return 'success';
    case 'pending': return 'warning';
    case 'lost': return 'error';
    default: return 'neutral';
  }
}

function getAccessModeStyle(mode: string): string {
  switch (mode) {
    case 'ReadWriteOnce': return 'bg-blue-500/20 text-blue-400 border border-blue-500/30';
    case 'ReadOnlyMany': return 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
    case 'ReadWriteMany': return 'bg-purple-500/20 text-purple-400 border border-purple-500/30';
    case 'ReadWriteOncePod': return 'bg-amber-500/20 text-amber-400 border border-amber-500/30';
    default: return 'bg-gray-700 text-gray-300';
  }
}

function formatAccessMode(mode: string): string {
  switch (mode) {
    case 'ReadWriteOnce': return 'RWO';
    case 'ReadOnlyMany': return 'ROX';
    case 'ReadWriteMany': return 'RWX';
    case 'ReadWriteOncePod': return 'RWOP';
    default: return mode;
  }
}

function getPVSource(pvSpec: Record<string, unknown>): string {
  if (pvSpec.hostPath) return 'hostPath';
  if (pvSpec.nfs) return 'nfs';
  if (pvSpec.csi) {
    const csi = pvSpec.csi as Record<string, string>;
    return `csi (${csi.driver})`;
  }
  if (pvSpec.local) return 'local';
  if (pvSpec.awsElasticBlockStore) return 'awsEBS';
  if (pvSpec.gcePersistentDisk) return 'gcePD';
  if (pvSpec.azureDisk) return 'azureDisk';
  if (pvSpec.azureFile) return 'azureFile';
  return 'unknown';
}
