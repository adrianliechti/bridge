// Pod Adapter
// Extracts display data from Pod resources

import type { ResourceAdapter, ResourceSections, ContainerData, VolumeData } from './types';
import type { V1Pod, V1Container, V1ContainerStatus, V1Volume } from '@kubernetes/client-node';

export const PodAdapter: ResourceAdapter<V1Pod> = {
  kinds: ['Pod', 'Pods'],

  adapt(resource): ResourceSections {
    const spec = resource.spec;
    const status = resource.status;
    const metadata = resource.metadata;

    if (!spec) {
      return { sections: [] };
    }

    const containers = spec.containers ?? [];
    const initContainers = spec.initContainers ?? [];
    const containerStatuses = status?.containerStatuses ?? [];
    const initContainerStatuses = status?.initContainerStatuses ?? [];

    const totalRestarts = containerStatuses.reduce((sum, c) => sum + (c.restartCount ?? 0), 0);
    
    // Filter labels (remove internal ones)
    const labels = metadata?.labels ?? {};
    const filteredLabels = Object.fromEntries(
      Object.entries(labels).filter(([key]) => 
        !key.includes('pod-template-hash') && 
        !key.includes('controller-revision-hash')
      )
    );
    
    // Filter annotations (remove internal ones)
    const annotations = metadata?.annotations ?? {};
    const filteredAnnotations = Object.fromEntries(
      Object.entries(annotations).filter(([key]) => 
        !key.includes('kubectl.kubernetes.io/last-applied-configuration')
      )
    );
    
    // Filter conditions to only show problematic ones
    const problematicConditions = (status?.conditions ?? []).filter(c => c.status !== 'True');

    return {
      sections: [
        // Status overview
        {
          id: 'status',
          data: {
            type: 'status-cards',
            items: [
              { label: 'Phase', value: status?.phase || 'Unknown', status: getPhaseStatus(status?.phase) },
              { label: 'Pod IP', value: status?.podIP || 'Pending' },
              { label: 'Node', value: spec.nodeName || 'Not scheduled' },
              { label: 'Restarts', value: totalRestarts, status: totalRestarts > 0 ? 'warning' : 'success' },
            ],
          },
        },
        
        // Labels
        ...(Object.keys(filteredLabels).length > 0 ? [{
          id: 'labels',
          data: {
            type: 'labels' as const,
            labels: filteredLabels,
            title: 'Labels',
          },
        }] : []),
        
        // Annotations
        ...(Object.keys(filteredAnnotations).length > 0 ? [{
          id: 'annotations',
          data: {
            type: 'labels' as const,
            labels: filteredAnnotations,
            title: 'Annotations',
          },
        }] : []),

        // Init containers
        ...(initContainers.length > 0 ? [{
          id: 'init-containers',
          title: 'Init Containers',
          data: {
            type: 'containers' as const,
            items: initContainers.map(c => mapContainer(c, initContainerStatuses)),
          },
        }] : []),

        // Containers
        {
          id: 'containers',
          title: 'Containers',
          data: {
            type: 'containers',
            items: containers.map(c => mapContainer(c, containerStatuses)),
          },
        },

        // Volumes
        ...(spec.volumes?.length ? [{
          id: 'volumes',
          title: 'Volumes',
          data: {
            type: 'volumes' as const,
            items: spec.volumes.map(v => mapVolume(v, [...containers, ...initContainers])),
          },
        }] : []),

        // Conditions (only problematic ones)
        ...(problematicConditions.length > 0 ? [{
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
        }] : []),
      ],
    };
  },
};

function mapContainer(container: V1Container, statuses: V1ContainerStatus[]): ContainerData {
  const status = statuses.find(s => s.name === container.name);
  const state = getContainerState(status);
  
  return {
    name: container.name,
    image: container.image || '',
    state: state.state,
    stateReason: state.reason,
    ready: status?.ready,
    restartCount: status?.restartCount,
    resources: container.resources ? {
      requests: container.resources.requests as Record<string, string> | undefined,
      limits: container.resources.limits as Record<string, string> | undefined,
    } : undefined,
    ports: container.ports?.map(p => ({
      name: p.name,
      containerPort: p.containerPort,
      protocol: p.protocol,
    })),
    command: container.command,
    args: container.args,
    mounts: container.volumeMounts?.map(m => ({
      name: m.name,
      mountPath: m.mountPath,
      readOnly: m.readOnly,
      subPath: m.subPath,
    })),
  };
}

function mapVolume(volume: V1Volume, containers: V1Container[]): VolumeData {
  const info = getVolumeInfo(volume);
  
  // Find all containers that mount this volume
  const mounts: VolumeData['mounts'] = [];
  for (const container of containers) {
    if (container.volumeMounts) {
      for (const mount of container.volumeMounts) {
        if (mount.name === volume.name) {
          mounts.push({
            container: container.name,
            mountPath: mount.mountPath,
            readOnly: mount.readOnly ?? false,
            subPath: mount.subPath,
          });
        }
      }
    }
  }

  return {
    name: volume.name,
    type: info.type,
    source: info.detail,
    extra: info.extra,
    mounts,
  };
}

function getPhaseStatus(phase?: string): 'success' | 'warning' | 'error' | 'neutral' {
  switch (phase?.toLowerCase()) {
    case 'running': return 'success';
    case 'succeeded': return 'success';
    case 'pending': return 'warning';
    case 'failed': return 'error';
    default: return 'neutral';
  }
}

function getContainerState(status?: V1ContainerStatus): { state?: 'running' | 'waiting' | 'terminated'; reason?: string } {
  if (!status?.state) return {};

  if (status.state.running) {
    return { state: 'running' };
  }
  if (status.state.waiting) {
    return { state: 'waiting', reason: status.state.waiting.reason };
  }
  if (status.state.terminated) {
    return { state: 'terminated', reason: status.state.terminated.reason };
  }
  return {};
}

function getVolumeInfo(volume: V1Volume): { type: string; detail: string; extra?: Record<string, string> } {
  if (volume.configMap) {
    return { 
      type: 'ConfigMap', 
      detail: volume.configMap.name || '',
      extra: {
        ...(volume.configMap.optional !== undefined && { optional: String(volume.configMap.optional) }),
        ...(volume.configMap.defaultMode !== undefined && { defaultMode: String(volume.configMap.defaultMode).padStart(4, '0') }),
      }
    };
  }
  if (volume.secret) {
    return { 
      type: 'Secret', 
      detail: volume.secret.secretName || '',
      extra: {
        ...(volume.secret.optional !== undefined && { optional: String(volume.secret.optional) }),
        ...(volume.secret.defaultMode !== undefined && { defaultMode: String(volume.secret.defaultMode).padStart(4, '0') }),
      }
    };
  }
  if (volume.emptyDir) {
    return { 
      type: 'EmptyDir', 
      detail: volume.emptyDir.medium || 'default',
      extra: {
        ...(volume.emptyDir.sizeLimit && { sizeLimit: volume.emptyDir.sizeLimit }),
      }
    };
  }
  if (volume.hostPath) {
    return { 
      type: 'HostPath', 
      detail: volume.hostPath.path,
      extra: {
        ...(volume.hostPath.type && { type: volume.hostPath.type }),
      }
    };
  }
  if (volume.persistentVolumeClaim) {
    return { 
      type: 'PVC', 
      detail: volume.persistentVolumeClaim.claimName,
      extra: {
        ...(volume.persistentVolumeClaim.readOnly && { readOnly: 'true' }),
      }
    };
  }
  if (volume.projected) {
    const sources = volume.projected.sources || [];
    const sourceTypes = sources.map(s => {
      if (s.configMap) return 'ConfigMap';
      if (s.secret) return 'Secret';
      if (s.serviceAccountToken) return 'ServiceAccountToken';
      if (s.downwardAPI) return 'DownwardAPI';
      return 'Unknown';
    });
    return { 
      type: 'Projected', 
      detail: `${sources.length} sources`,
      extra: {
        sources: sourceTypes.join(', '),
        ...(volume.projected.defaultMode !== undefined && { defaultMode: String(volume.projected.defaultMode).padStart(4, '0') }),
      }
    };
  }
  if (volume.downwardAPI) {
    return { 
      type: 'DownwardAPI', 
      detail: `${volume.downwardAPI.items?.length || 0} items`,
      extra: {
        ...(volume.downwardAPI.defaultMode !== undefined && { defaultMode: String(volume.downwardAPI.defaultMode).padStart(4, '0') }),
      }
    };
  }
  if (volume.nfs) {
    return { 
      type: 'NFS', 
      detail: `${volume.nfs.server}:${volume.nfs.path}`,
      extra: {
        ...(volume.nfs.readOnly && { readOnly: 'true' }),
      }
    };
  }
  if (volume.csi) {
    return { 
      type: 'CSI', 
      detail: volume.csi.driver,
      extra: {
        ...(volume.csi.fsType && { fsType: volume.csi.fsType }),
        ...(volume.csi.readOnly && { readOnly: 'true' }),
      }
    };
  }
  return { type: 'Unknown', detail: '' };
}
