import { useState } from 'react';
import { Box, ChevronDown, ChevronRight, Cpu, HardDrive, Activity } from 'lucide-react';
import { registerVisualizer, type ResourceVisualizerProps } from './Visualizer';
import { StatusCard } from './shared';
import type { V1Pod, V1Container, V1ContainerStatus, V1Volume } from '@kubernetes/client-node';

export function PodVisualizer({ resource }: ResourceVisualizerProps) {
  const pod = resource as unknown as V1Pod;
  const spec = pod.spec;
  const status = pod.status;

  if (!spec) {
    return <div className="text-gray-500 text-sm">No pod spec available</div>;
  }

  return (
    <div className="space-y-4">
      {/* Pod Status Overview */}
      <div className="grid grid-cols-2 gap-3">
        <StatusCard 
          label="Phase" 
          value={status?.phase || 'Unknown'} 
          status={getPhaseStatus(status?.phase)}
        />
        <StatusCard 
          label="Pod IP" 
          value={status?.podIP || 'Pending'} 
        />
        <StatusCard 
          label="Node" 
          value={spec.nodeName || 'Not scheduled'} 
        />
        <StatusCard 
          label="Restarts" 
          value={getTotalRestarts(status?.containerStatuses)} 
          status={getTotalRestarts(status?.containerStatuses) > 0 ? 'warning' : 'success'}
        />
      </div>

      {/* Init Containers */}
      {spec.initContainers && spec.initContainers.length > 0 && (
        <ContainerSection
          title="Init Containers"
          containers={spec.initContainers}
          statuses={status?.initContainerStatuses}
        />
      )}

      {/* Containers */}
      {spec.containers && (
        <ContainerSection
          title="Containers"
          containers={spec.containers}
          statuses={status?.containerStatuses}
        />
      )}

      {/* Volumes */}
      {spec.volumes && spec.volumes.length > 0 && (
        <VolumesSection volumes={spec.volumes} containers={[...(spec.initContainers || []), ...spec.containers]} />
      )}
    </div>
  );
}

// Register this visualizer (both singular and plural to match resourceKind title)
registerVisualizer('Pod', PodVisualizer);
registerVisualizer('Pods', PodVisualizer);

// Helper components

function ContainerSection({ 
  title, 
  containers, 
  statuses 
}: { 
  title: string; 
  containers: V1Container[]; 
  statuses?: V1ContainerStatus[];
}) {
  return (
    <div>
      <h5 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
        {title} ({containers.length})
      </h5>
      <div className="space-y-2">
        {containers.map((container) => {
          const status = statuses?.find(s => s.name === container.name);
          return (
            <ContainerCard 
              key={container.name} 
              container={container} 
              status={status}
            />
          );
        })}
      </div>
    </div>
  );
}

function ContainerCard({ 
  container, 
  status 
}: { 
  container: V1Container; 
  status?: V1ContainerStatus;
}) {
  const [expanded, setExpanded] = useState(false);
  const state = getContainerState(status);

  return (
    <div className={`border rounded-lg overflow-hidden ${
      state.status === 'success' ? 'border-emerald-500/30 bg-emerald-500/5' :
      state.status === 'warning' ? 'border-amber-500/30 bg-amber-500/5' :
      state.status === 'error' ? 'border-red-500/30 bg-red-500/5' :
      'border-gray-700 bg-gray-900/50'
    }`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-gray-800/30 transition-colors"
      >
        {expanded ? (
          <ChevronDown size={14} className="text-gray-500" />
        ) : (
          <ChevronRight size={14} className="text-gray-500" />
        )}
        <Box size={16} className={state.color} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-100">{container.name}</span>
            <span className={`px-1.5 py-0.5 rounded text-xs ${
              state.status === 'success' ? 'bg-emerald-500/20 text-emerald-400' :
              state.status === 'warning' ? 'bg-amber-500/20 text-amber-400' :
              state.status === 'error' ? 'bg-red-500/20 text-red-400' :
              'bg-gray-700 text-gray-400'
            }`}>
              {state.label}
            </span>
          </div>
          <div className="text-xs text-gray-500 truncate">{container.image}</div>
        </div>
        {status && (
          <div className="text-xs text-gray-500">
            {(status.restartCount ?? 0) > 0 && (
              <span className="text-amber-400">{status.restartCount} restarts</span>
            )}
          </div>
        )}
      </button>

      {expanded && (
        <div className="border-t border-gray-800 p-3 space-y-3">
          {/* Image */}
          <div>
            <div className="text-xs text-gray-500 mb-1">Image</div>
            <div className="text-xs text-cyan-400 break-all">{container.image}</div>
          </div>

          {/* Command & Args */}
          {(container.command || container.args) && (
            <div>
              <div className="text-xs text-gray-500 mb-1">Command</div>
              <code className="text-xs text-gray-300 bg-gray-800 px-2 py-1 rounded block">
                {[...(container.command || []), ...(container.args || [])].join(' ')}
              </code>
            </div>
          )}

          {/* Ports */}
          {container.ports && container.ports.length > 0 && (
            <div>
              <div className="text-xs text-gray-500 mb-1">Ports</div>
              <div className="flex flex-wrap gap-1">
                {container.ports.map((port, i) => (
                  <span key={i} className="text-xs bg-gray-800 px-2 py-1 rounded">
                    {port.containerPort}/{port.protocol || 'TCP'}
                    {port.name && <span className="text-gray-500 ml-1">({port.name})</span>}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Resources */}
          {container.resources && (
            <div className="grid grid-cols-2 gap-2">
              {container.resources.requests && (
                <div>
                  <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                    <Cpu size={10} /> Requests
                  </div>
                  <div className="text-xs space-y-0.5">
                    {Object.entries(container.resources.requests).map(([k, v]) => (
                      <div key={k} className="text-gray-400">
                        <span className="text-gray-500">{k}:</span> {String(v)}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {container.resources.limits && (
                <div>
                  <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                    <Activity size={10} /> Limits
                  </div>
                  <div className="text-xs space-y-0.5">
                    {Object.entries(container.resources.limits).map(([k, v]) => (
                      <div key={k} className="text-gray-400">
                        <span className="text-gray-500">{k}:</span> {String(v)}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Volume Mounts */}
          {container.volumeMounts && container.volumeMounts.length > 0 && (
            <div>
              <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                <HardDrive size={10} /> Volume Mounts
              </div>
              <div className="text-xs space-y-0.5">
                {container.volumeMounts.map((mount, i) => (
                  <div key={i} className="text-gray-400">
                    <span className="text-purple-400">{mount.name}</span>
                    <span className="text-gray-600 mx-1">→</span>
                    <span className="text-cyan-400">{mount.mountPath}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function VolumesSection({ volumes, containers }: { volumes: V1Volume[]; containers: V1Container[] }) {
  const [expanded, setExpanded] = useState(false);

  // Helper to determine volume type and details
  const getVolumeInfo = (volume: V1Volume): { type: string; detail: string } => {
    if (volume.configMap) return { type: 'ConfigMap', detail: volume.configMap.name || '' };
    if (volume.secret) return { type: 'Secret', detail: volume.secret.secretName || '' };
    if (volume.emptyDir) return { type: 'EmptyDir', detail: volume.emptyDir.medium || 'default' };
    if (volume.hostPath) return { type: 'HostPath', detail: volume.hostPath.path };
    if (volume.persistentVolumeClaim) return { type: 'PVC', detail: volume.persistentVolumeClaim.claimName };
    if (volume.projected) return { type: 'Projected', detail: `${volume.projected.sources?.length || 0} sources` };
    if (volume.downwardAPI) return { type: 'DownwardAPI', detail: `${volume.downwardAPI.items?.length || 0} items` };
    if (volume.nfs) return { type: 'NFS', detail: `${volume.nfs.server}:${volume.nfs.path}` };
    if (volume.csi) return { type: 'CSI', detail: volume.csi.driver };
    return { type: 'Unknown', detail: '' };
  };

  // Get all mount points for a volume
  const getVolumeMounts = (volumeName: string): Array<{ container: string; mountPath: string; readOnly: boolean; subPath?: string }> => {
    const mounts: Array<{ container: string; mountPath: string; readOnly: boolean; subPath?: string }> = [];
    for (const container of containers) {
      if (container.volumeMounts) {
        for (const mount of container.volumeMounts) {
          if (mount.name === volumeName) {
            mounts.push({
              container: container.name,
              mountPath: mount.mountPath,
              readOnly: mount.readOnly ?? false,
              subPath: mount.subPath
            });
          }
        }
      }
    }
    return mounts;
  };

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs font-medium text-gray-500 uppercase tracking-wider mb-2 hover:text-gray-300 transition-colors"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        Volumes ({volumes.length})
      </button>
      {expanded && (
        <div className="space-y-2">
          {volumes.map((volume) => {
            const info = getVolumeInfo(volume);
            const mounts = getVolumeMounts(volume.name);
            return (
              <div key={volume.name} className="text-xs bg-gray-900/50 px-3 py-2 rounded-lg border border-gray-800">
                <div className="flex items-center gap-2 mb-1">
                  <HardDrive size={12} className="text-purple-400" />
                  <span className="text-purple-400 font-medium">{volume.name}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                    info.type === 'ConfigMap' ? 'bg-blue-500/20 text-blue-400' :
                    info.type === 'Secret' ? 'bg-amber-500/20 text-amber-400' :
                    info.type === 'PVC' ? 'bg-emerald-500/20 text-emerald-400' :
                    info.type === 'EmptyDir' ? 'bg-gray-500/20 text-gray-400' :
                    info.type === 'HostPath' ? 'bg-red-500/20 text-red-400' :
                    'bg-gray-700 text-gray-400'
                  }`}>
                    {info.type}
                  </span>
                </div>
                {info.detail && (
                  <div className="text-gray-500 ml-5 mb-1">
                    <span className="text-gray-600">Source:</span>{' '}
                    <span className="text-cyan-400">{info.detail}</span>
                  </div>
                )}
                {mounts.length > 0 && (
                  <div className="ml-5 mt-1.5 space-y-1 border-l border-gray-700 pl-2">
                    {mounts.map((mount, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-gray-400">
                        <Box size={10} className="text-gray-600" />
                        <span className="text-gray-500">{mount.container}</span>
                        <span className="text-gray-600">→</span>
                        <span className="text-cyan-400 font-mono">{mount.mountPath}</span>
                        {mount.subPath && (
                          <span className="text-gray-600">(subPath: {mount.subPath})</span>
                        )}
                        {mount.readOnly && (
                          <span className="text-amber-500/70 text-[10px]">RO</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Helper functions

function getPhaseStatus(phase?: string): 'success' | 'warning' | 'error' | 'neutral' {
  switch (phase?.toLowerCase()) {
    case 'running': return 'success';
    case 'succeeded': return 'success';
    case 'pending': return 'warning';
    case 'failed': return 'error';
    default: return 'neutral';
  }
}

function getTotalRestarts(statuses?: V1ContainerStatus[]): number {
  return statuses?.reduce((sum, s) => sum + (s.restartCount ?? 0), 0) ?? 0;
}

function getContainerState(status?: V1ContainerStatus): { label: string; status: 'success' | 'warning' | 'error' | 'neutral'; color: string } {
  if (!status) {
    return { label: 'Unknown', status: 'neutral', color: 'text-gray-400' };
  }

  if (status.state?.running) {
    return { label: 'Running', status: 'success', color: 'text-emerald-400' };
  }
  if (status.state?.waiting) {
    const reason = status.state.waiting.reason;
    if (reason === 'CrashLoopBackOff' || reason === 'Error') {
      return { label: reason, status: 'error', color: 'text-red-400' };
    }
    return { label: reason || 'Waiting', status: 'warning', color: 'text-amber-400' };
  }
  if (status.state?.terminated) {
    const reason = status.state.terminated.reason;
    if (status.state.terminated.exitCode === 0) {
      return { label: reason || 'Completed', status: 'success', color: 'text-emerald-400' };
    }
    return { label: reason || 'Terminated', status: 'error', color: 'text-red-400' };
  }

  return { label: 'Unknown', status: 'neutral', color: 'text-gray-400' };
}
