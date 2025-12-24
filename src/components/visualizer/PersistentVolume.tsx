import { HardDrive, Database, Link, Server, Cloud } from 'lucide-react';
import { registerVisualizer, type ResourceVisualizerProps } from './Visualizer';
import type { V1PersistentVolume } from '@kubernetes/client-node';

export function PersistentVolumeVisualizer({ resource }: ResourceVisualizerProps) {
  const pv = resource as unknown as V1PersistentVolume;
  const spec = pv.spec;
  const status = pv.status;

  if (!spec) {
    return <div className="text-gray-500 text-sm">No persistent volume spec available</div>;
  }

  const phase = status?.phase ?? 'Unknown';
  const capacity = spec.capacity?.storage ?? 'Unknown';

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
          label="Capacity" 
          value={capacity} 
          icon={<HardDrive size={14} className="text-purple-400" />}
        />
        <StatusCard 
          label="Reclaim Policy" 
          value={spec.persistentVolumeReclaimPolicy ?? 'Delete'} 
          status={spec.persistentVolumeReclaimPolicy === 'Retain' ? 'warning' : 'neutral'}
        />
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

      {/* Claim Reference */}
      {spec.claimRef && (
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
            <Link size={10} /> Bound To
          </div>
          <div className="text-sm">
            <span className="text-gray-500">{spec.claimRef.namespace}/</span>
            <span className="text-cyan-400">{spec.claimRef.name}</span>
          </div>
        </div>
      )}

      {/* Volume Source */}
      <VolumeSourceSection spec={spec} />

      {/* Node Affinity */}
      {spec.nodeAffinity?.required?.nodeSelectorTerms && (
        <div>
          <h5 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
            Node Affinity
          </h5>
          <div className="space-y-2">
            {spec.nodeAffinity.required.nodeSelectorTerms.map((term, i) => (
              <div key={i} className="bg-gray-900/50 rounded-lg p-2">
                {term.matchExpressions?.map((expr, j) => (
                  <div key={j} className="text-xs">
                    <span className="text-purple-400">{expr.key}</span>
                    <span className="text-gray-500 mx-1">{expr.operator}</span>
                    {expr.values && (
                      <span className="text-cyan-400">{expr.values.join(', ')}</span>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mount Options */}
      {spec.mountOptions && spec.mountOptions.length > 0 && (
        <div>
          <h5 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
            Mount Options
          </h5>
          <div className="flex flex-wrap gap-1">
            {spec.mountOptions.map((opt, i) => (
              <span key={i} className="text-xs bg-gray-800 px-2 py-1 rounded text-gray-300">
                {opt}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Register this visualizer
registerVisualizer('PersistentVolume', PersistentVolumeVisualizer);
registerVisualizer('PersistentVolumes', PersistentVolumeVisualizer);

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

function VolumeSourceSection({ spec }: { spec: V1PersistentVolume['spec'] }) {
  if (!spec) return null;

  const sourceType = getVolumeSourceType(spec);
  const sourceDetails = getVolumeSourceDetails(spec);

  return (
    <div>
      <h5 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
        Volume Source
      </h5>
      <div className="bg-gray-900/50 rounded-lg p-3">
        <div className="flex items-center gap-2 mb-2">
          {getVolumeSourceIcon(sourceType)}
          <span className="text-sm text-gray-100 capitalize">{sourceType}</span>
        </div>
        {sourceDetails.length > 0 && (
          <div className="space-y-1">
            {sourceDetails.map((detail, i) => (
              <div key={i} className="text-xs">
                <span className="text-gray-500">{detail.label}:</span>{' '}
                <span className="text-cyan-400">{detail.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Helper functions

function getPhaseStatus(phase: string): 'success' | 'warning' | 'error' | 'neutral' {
  switch (phase.toLowerCase()) {
    case 'bound': return 'success';
    case 'available': return 'success';
    case 'released': return 'warning';
    case 'failed': return 'error';
    case 'pending': return 'warning';
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

function getVolumeSourceType(spec: V1PersistentVolume['spec']): string {
  if (!spec) return 'unknown';
  if (spec.hostPath) return 'hostPath';
  if (spec.nfs) return 'nfs';
  if (spec.csi) return 'csi';
  if (spec.local) return 'local';
  if (spec.awsElasticBlockStore) return 'awsEBS';
  if (spec.gcePersistentDisk) return 'gcePD';
  if (spec.azureDisk) return 'azureDisk';
  if (spec.azureFile) return 'azureFile';
  if (spec.iscsi) return 'iscsi';
  if (spec.fc) return 'fc';
  if (spec.cephfs) return 'cephfs';
  if (spec.rbd) return 'rbd';
  if (spec.glusterfs) return 'glusterfs';
  if (spec.portworxVolume) return 'portworx';
  if (spec.storageos) return 'storageos';
  return 'unknown';
}

function getVolumeSourceIcon(sourceType: string): React.ReactNode {
  switch (sourceType) {
    case 'hostPath':
    case 'local':
      return <Server size={14} className="text-amber-400" />;
    case 'nfs':
    case 'glusterfs':
    case 'cephfs':
      return <Database size={14} className="text-purple-400" />;
    case 'csi':
    case 'awsEBS':
    case 'gcePD':
    case 'azureDisk':
    case 'azureFile':
      return <Cloud size={14} className="text-cyan-400" />;
    default:
      return <HardDrive size={14} className="text-gray-400" />;
  }
}

function getVolumeSourceDetails(spec: V1PersistentVolume['spec']): Array<{ label: string; value: string }> {
  if (!spec) return [];
  
  const details: Array<{ label: string; value: string }> = [];

  if (spec.hostPath) {
    details.push({ label: 'Path', value: spec.hostPath.path });
    if (spec.hostPath.type) {
      details.push({ label: 'Type', value: spec.hostPath.type });
    }
  }

  if (spec.nfs) {
    details.push({ label: 'Server', value: spec.nfs.server });
    details.push({ label: 'Path', value: spec.nfs.path });
  }

  if (spec.csi) {
    details.push({ label: 'Driver', value: spec.csi.driver });
    if (spec.csi.volumeHandle) {
      details.push({ label: 'Volume Handle', value: spec.csi.volumeHandle });
    }
    if (spec.csi.fsType) {
      details.push({ label: 'FS Type', value: spec.csi.fsType });
    }
  }

  if (spec.local) {
    details.push({ label: 'Path', value: spec.local.path });
    if (spec.local.fsType) {
      details.push({ label: 'FS Type', value: spec.local.fsType });
    }
  }

  if (spec.awsElasticBlockStore) {
    details.push({ label: 'Volume ID', value: spec.awsElasticBlockStore.volumeID });
    if (spec.awsElasticBlockStore.fsType) {
      details.push({ label: 'FS Type', value: spec.awsElasticBlockStore.fsType });
    }
  }

  if (spec.gcePersistentDisk) {
    details.push({ label: 'PD Name', value: spec.gcePersistentDisk.pdName });
    if (spec.gcePersistentDisk.fsType) {
      details.push({ label: 'FS Type', value: spec.gcePersistentDisk.fsType });
    }
  }

  if (spec.azureDisk) {
    details.push({ label: 'Disk Name', value: spec.azureDisk.diskName });
    details.push({ label: 'Disk URI', value: spec.azureDisk.diskURI });
  }

  if (spec.iscsi) {
    details.push({ label: 'Target Portal', value: spec.iscsi.targetPortal });
    details.push({ label: 'IQN', value: spec.iscsi.iqn });
    details.push({ label: 'Lun', value: String(spec.iscsi.lun) });
  }

  return details;
}
