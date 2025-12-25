import { useState, useEffect } from 'react';
import { Database, Box, HardDrive } from 'lucide-react';
import { registerVisualizer, type ResourceVisualizerProps } from './Visualizer';
import { StatusGauge, ConditionsSection } from './shared';
import { getResourceList, getResourceConfig } from '../../api/kubernetes';
import type { V1StatefulSet } from '@kubernetes/client-node';

interface PVCDisplay {
  name: string;
  status: string;
  capacity?: string;
  storageClass?: string;
}

export function StatefulSetVisualizer({ resource, namespace }: ResourceVisualizerProps) {
  const statefulSet = resource as unknown as V1StatefulSet;
  const spec = statefulSet.spec;
  const status = statefulSet.status;
  const metadata = statefulSet.metadata;
  const [pvcs, setPvcs] = useState<PVCDisplay[]>([]);
  const [loadingPvcs, setLoadingPvcs] = useState(true);

  // Fetch PVCs owned by this StatefulSet
  useEffect(() => {
    async function fetchPVCs() {
      if (!namespace || !metadata?.name) return;
      
      try {
        const pvcConfig = await getResourceConfig('persistentvolumeclaims');
        if (!pvcConfig) {
          console.warn('PVC resource config not found');
          return;
        }
        
        const pvcs = await getResourceList(pvcConfig, namespace);

        // Filter PVCs that match StatefulSet naming pattern: <claim-name>-<statefulset-name>-<ordinal>
        const stsName = metadata.name;
        const claimTemplates = spec?.volumeClaimTemplates?.map(t => t.metadata?.name) ?? [];
        
        const ownedPVCs = pvcs
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

        setPvcs(ownedPVCs);
      } catch (error) {
        console.error('Failed to fetch PVCs:', error);
      } finally {
        setLoadingPvcs(false);
      }
    }

    fetchPVCs();
  }, [metadata?.name, namespace, spec?.volumeClaimTemplates]);

  if (!spec) {
    return <div className="text-gray-500 text-sm">No statefulset spec available</div>;
  }

  const desiredReplicas = spec.replicas ?? 1;
  const readyReplicas = status?.readyReplicas ?? 0;
  const currentReplicas = status?.currentReplicas ?? 0;
  const updatedReplicas = status?.updatedReplicas ?? 0;
  const availableReplicas = status?.availableReplicas ?? 0;

  return (
    <div className="space-y-4">
      {/* Replica Status */}
      <div>
        <h5 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
          Replica Status
        </h5>
        <div className="bg-gray-900/50 rounded-lg p-3">
          <div className="flex items-center gap-4 mb-3">
            <StatusGauge 
              label="Ready" 
              current={readyReplicas} 
              total={desiredReplicas}
              color="emerald"
            />
            <StatusGauge 
              label="Current" 
              current={currentReplicas} 
              total={desiredReplicas}
              color="blue"
            />
            <StatusGauge 
              label="Updated" 
              current={updatedReplicas} 
              total={desiredReplicas}
              color="cyan"
            />
          </div>
          
          {/* Visual ordered pods */}
          <div className="flex flex-wrap gap-1">
            {Array.from({ length: desiredReplicas }).map((_, i) => {
              const isReady = i < readyReplicas;
              const isAvailable = i < availableReplicas;
              const podName = `${metadata?.name}-${i}`;
              return (
                <div
                  key={i}
                  className={`w-8 h-8 rounded flex flex-col items-center justify-center ${
                    isReady ? 'bg-emerald-500/20 border border-emerald-500/50' :
                    isAvailable ? 'bg-amber-500/20 border border-amber-500/50' :
                    'bg-gray-700/50 border border-gray-600'
                  }`}
                  title={`${podName}: ${isReady ? 'Ready' : isAvailable ? 'Available' : 'Pending'}`}
                >
                  <Database size={10} className={
                    isReady ? 'text-emerald-400' :
                    isAvailable ? 'text-amber-400' :
                    'text-gray-500'
                  } />
                  <span className={`text-[9px] ${
                    isReady ? 'text-emerald-400' :
                    isAvailable ? 'text-amber-400' :
                    'text-gray-500'
                  }`}>{i}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* StatefulSet Config */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-900/50 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">Service Name</div>
          <div className="text-sm text-cyan-400">{spec.serviceName}</div>
        </div>
        <div className="bg-gray-900/50 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">Pod Management</div>
          <div className="text-sm text-gray-100">
            {spec.podManagementPolicy || 'OrderedReady'}
          </div>
        </div>
        <div className="bg-gray-900/50 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">Update Strategy</div>
          <div className="text-sm text-gray-100">
            {spec.updateStrategy?.type || 'RollingUpdate'}
          </div>
        </div>
        {spec.updateStrategy?.rollingUpdate?.partition !== undefined && (
          <div className="bg-gray-900/50 rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-1">Partition</div>
            <div className="text-sm text-amber-400">
              {spec.updateStrategy.rollingUpdate.partition}
            </div>
          </div>
        )}
      </div>

      {/* Current Revision */}
      {status?.currentRevision && (
        <div className="bg-gray-900/50 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">Revisions</div>
          <div className="text-xs space-y-1">
            <div>
              <span className="text-gray-500">Current:</span>{' '}
              <span className="text-cyan-400 font-mono">{status.currentRevision}</span>
            </div>
            {status.updateRevision && status.updateRevision !== status.currentRevision && (
              <div>
                <span className="text-gray-500">Update:</span>{' '}
                <span className="text-amber-400 font-mono">{status.updateRevision}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Conditions */}
      {status?.conditions && status.conditions.length > 0 && (
        <ConditionsSection conditions={status.conditions} />
      )}

      {/* Volume Claim Templates */}
      {spec.volumeClaimTemplates && spec.volumeClaimTemplates.length > 0 && (
        <div>
          <h5 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
            Volume Claim Templates
          </h5>
          <div className="space-y-2">
            {spec.volumeClaimTemplates.map((template, i) => {
              const templateSpec = template.spec;
              return (
                <div key={i} className="bg-gray-900/50 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <HardDrive size={14} className="text-purple-400" />
                    <span className="text-sm text-gray-100">{template.metadata?.name}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {templateSpec?.resources?.requests?.storage && (
                      <div>
                        <span className="text-gray-500">Size:</span>{' '}
                        <span className="text-cyan-400">{templateSpec.resources.requests.storage}</span>
                      </div>
                    )}
                    {templateSpec?.storageClassName && (
                      <div>
                        <span className="text-gray-500">Class:</span>{' '}
                        <span className="text-purple-400">{templateSpec.storageClassName}</span>
                      </div>
                    )}
                    {templateSpec?.accessModes && (
                      <div className="col-span-2">
                        <span className="text-gray-500">Access:</span>{' '}
                        <span className="text-gray-300">{templateSpec.accessModes.join(', ')}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Associated PVCs */}
      <div>
        <h5 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
          Persistent Volume Claims
        </h5>
        {loadingPvcs ? (
          <div className="text-xs text-gray-500">Loading PVCs...</div>
        ) : pvcs.length === 0 ? (
          <div className="text-xs text-gray-500">No PVCs found</div>
        ) : (
          <div className="space-y-1">
            {pvcs.map(pvc => (
              <div key={pvc.name} className={`flex items-center justify-between text-xs px-2 py-1.5 rounded ${
                pvc.status === 'Bound' 
                  ? 'bg-emerald-500/10 border border-emerald-500/20'
                  : 'bg-gray-900/50 border border-gray-700'
              }`}>
                <div className="flex items-center gap-2">
                  <HardDrive size={12} className={pvc.status === 'Bound' ? 'text-emerald-400' : 'text-gray-500'} />
                  <span className="text-gray-300">{pvc.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  {pvc.capacity && (
                    <span className="text-cyan-400">{pvc.capacity}</span>
                  )}
                  <span className={pvc.status === 'Bound' ? 'text-emerald-400' : 'text-amber-400'}>
                    {pvc.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Container Images */}
      {spec.template?.spec?.containers && (
        <div>
          <h5 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
            Container Images
          </h5>
          <div className="space-y-1">
            {spec.template.spec.containers.map(container => (
              <div key={container.name} className="text-xs bg-gray-900/50 px-2 py-1.5 rounded flex items-center gap-2">
                <Box size={12} className="text-blue-400" />
                <span className="text-gray-300">{container.name}:</span>
                <span className="text-cyan-400 truncate">{container.image}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Register this visualizer
registerVisualizer('StatefulSet', StatefulSetVisualizer);
registerVisualizer('StatefulSets', StatefulSetVisualizer);
