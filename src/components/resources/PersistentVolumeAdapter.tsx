// PersistentVolume Adapter
// Extracts display data from PersistentVolume resources

import { HardDrive, Database, Link } from 'lucide-react';
import type { ResourceAdapter, ResourceSections } from './types';
import { getAccessModeStyle, formatAccessMode, getStandardMetadataSections } from './utils';
import type { V1PersistentVolume } from '@kubernetes/client-node';

export const PersistentVolumeAdapter: ResourceAdapter<V1PersistentVolume> = {
  kinds: ['PersistentVolume', 'PersistentVolumes'],

  adapt(resource): ResourceSections {
    const spec = resource.spec;
    const status = resource.status;

    if (!spec) {
      return { sections: [] };
    }

    const phase = status?.phase ?? 'Unknown';
    const capacity = spec.capacity?.storage ?? 'Unknown';

    return {
      sections: [
        // Status overview
        {
          id: 'status',
          data: {
            type: 'status-cards',
            items: [
              { label: 'Phase', value: phase, status: getPhaseStatus(phase) },
              { label: 'Capacity', value: capacity, icon: <HardDrive size={14} className="text-purple-400" /> },
              { label: 'Reclaim Policy', value: spec.persistentVolumeReclaimPolicy ?? 'Delete', status: spec.persistentVolumeReclaimPolicy === 'Retain' ? 'warning' : 'neutral' },
              { label: 'Volume Mode', value: spec.volumeMode ?? 'Filesystem' },
            ],
          },
        },

        // Labels and Annotations
        ...getStandardMetadataSections(resource.metadata),

        // Access Modes
        ...(spec.accessModes?.length ? [{
          id: 'access-modes',
          title: 'Access Modes',
          data: {
            type: 'custom' as const,
            render: () => (
              <div className="flex flex-wrap gap-2">
                {spec.accessModes!.map((mode, i) => (
                  <span 
                    key={i} 
                    className={`text-xs px-2 py-1 rounded ${getAccessModeStyle(mode)}`}
                  >
                    {formatAccessMode(mode)}
                  </span>
                ))}
              </div>
            ),
          },
        }] : []),

        // Storage Class
        ...(spec.storageClassName ? [{
          id: 'storage-class',
          data: {
            type: 'custom' as const,
            render: () => (
              <div className="bg-neutral-900/50 rounded-lg p-3">
                <div className="text-xs text-neutral-500 mb-1">Storage Class</div>
                <div className="text-sm text-purple-400 flex items-center gap-2">
                  <Database size={14} />
                  {spec.storageClassName}
                </div>
              </div>
            ),
          },
        }] : []),

        // Claim Reference
        ...(spec.claimRef ? [{
          id: 'claim-ref',
          data: {
            type: 'custom' as const,
            render: () => (
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                <div className="text-xs text-neutral-500 mb-1 flex items-center gap-1">
                  <Link size={10} /> Bound To
                </div>
                <div className="text-sm">
                  <span className="text-neutral-500">{spec.claimRef!.namespace}/</span>
                  <span className="text-cyan-400">{spec.claimRef!.name}</span>
                </div>
              </div>
            ),
          },
        }] : []),

        // Volume Source
        {
          id: 'source',
          title: 'Volume Source',
          data: {
            type: 'info-grid',
            items: getVolumeSourceInfo(spec),
            columns: 2 as const,
          },
        },

        // Node Affinity
        ...(spec.nodeAffinity?.required?.nodeSelectorTerms ? [{
          id: 'node-affinity',
          title: 'Node Affinity',
          data: {
            type: 'custom' as const,
            render: () => (
              <div className="space-y-2">
                {spec.nodeAffinity!.required!.nodeSelectorTerms.map((term, i) => (
                  <div key={i} className="bg-neutral-900/50 rounded-lg p-2">
                    {term.matchExpressions?.map((expr, j) => (
                      <div key={j} className="text-xs">
                        <span className="text-purple-400">{expr.key}</span>
                        <span className="text-neutral-500 mx-1">{expr.operator}</span>
                        {expr.values && (
                          <span className="text-cyan-400">{expr.values.join(', ')}</span>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ),
          },
        }] : []),

        // Mount Options
        ...(spec.mountOptions?.length ? [{
          id: 'mount-options',
          title: 'Mount Options',
          data: {
            type: 'custom' as const,
            render: () => (
              <div className="flex flex-wrap gap-1">
                {spec.mountOptions!.map((opt, i) => (
                  <span key={i} className="text-xs bg-neutral-800 px-2 py-1 rounded text-neutral-300">
                    {opt}
                  </span>
                ))}
              </div>
            ),
          },
        }] : []),
      ],
    };
  },
};

function getPhaseStatus(phase: string): 'success' | 'warning' | 'error' | 'neutral' {
  switch (phase) {
    case 'Bound': return 'success';
    case 'Available': return 'success';
    case 'Released': return 'warning';
    case 'Failed': return 'error';
    default: return 'neutral';
  }
}

function getVolumeSourceInfo(spec: V1PersistentVolume['spec']): Array<{ label: string; value: string | undefined; color?: string }> {
  if (!spec) return [];

  const items: Array<{ label: string; value: string | undefined; color?: string }> = [];

  if (spec.hostPath) {
    items.push({ label: 'Type', value: 'HostPath' });
    items.push({ label: 'Path', value: spec.hostPath.path, color: 'text-cyan-400' });
  } else if (spec.nfs) {
    items.push({ label: 'Type', value: 'NFS' });
    items.push({ label: 'Server', value: spec.nfs.server, color: 'text-cyan-400' });
    items.push({ label: 'Path', value: spec.nfs.path, color: 'text-cyan-400' });
  } else if (spec.csi) {
    items.push({ label: 'Type', value: 'CSI' });
    items.push({ label: 'Driver', value: spec.csi.driver, color: 'text-purple-400' });
    if (spec.csi.volumeHandle) {
      items.push({ label: 'Handle', value: spec.csi.volumeHandle, color: 'text-cyan-400' });
    }
  } else if (spec.local) {
    items.push({ label: 'Type', value: 'Local' });
    items.push({ label: 'Path', value: spec.local.path, color: 'text-cyan-400' });
  } else if (spec.awsElasticBlockStore) {
    items.push({ label: 'Type', value: 'AWS EBS' });
    items.push({ label: 'Volume ID', value: spec.awsElasticBlockStore.volumeID, color: 'text-cyan-400' });
  } else if (spec.gcePersistentDisk) {
    items.push({ label: 'Type', value: 'GCE PD' });
    items.push({ label: 'PD Name', value: spec.gcePersistentDisk.pdName, color: 'text-cyan-400' });
  } else if (spec.azureDisk) {
    items.push({ label: 'Type', value: 'Azure Disk' });
    items.push({ label: 'Disk Name', value: spec.azureDisk.diskName, color: 'text-cyan-400' });
  } else {
    items.push({ label: 'Type', value: 'Unknown' });
  }

  return items;
}
