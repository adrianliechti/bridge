// Utility functions for visualizers

import type { Section, ContainerData, ResourceQuotaData, ConditionData } from './types';
import type { V1Container } from '@kubernetes/client-node';
import { 
  parseCpuToNanoCores, 
  parseMemoryToBytes, 
  formatCpu, 
  formatBytes 
} from '../../api/kubernetesMetrics';

// =============================================================================
// CONDITION DESCRIPTIONS
// Human-friendly descriptions for common Kubernetes conditions
// =============================================================================

interface ConditionDescriptions {
  [type: string]: { true: string; false: string };
}

// Pod conditions
const POD_CONDITIONS: ConditionDescriptions = {
  'PodScheduled': {
    true: 'Pod has been assigned to a node',
    false: 'Pod is waiting to be scheduled to a node',
  },
  'PodReadyToStartContainers': {
    true: 'Pod sandbox and networking are configured',
    false: 'Pod sandbox or networking is being set up',
  },
  'Initialized': {
    true: 'All init containers have completed successfully',
    false: 'Init containers are still running or failed',
  },
  'ContainersReady': {
    true: 'All containers in the pod are ready',
    false: 'One or more containers are not ready',
  },
  'Ready': {
    true: 'Pod is ready to serve requests',
    false: 'Pod is not ready to serve requests',
  },
  'DisruptionTarget': {
    true: 'Pod is about to be terminated due to disruption',
    false: 'Pod is not targeted for disruption',
  },
};

// Deployment conditions
const DEPLOYMENT_CONDITIONS: ConditionDescriptions = {
  'Available': {
    true: 'Deployment has minimum availability',
    false: 'Deployment does not have minimum availability',
  },
  'Progressing': {
    true: 'Deployment is making progress',
    false: 'Deployment has stalled or failed to progress',
  },
  'ReplicaFailure': {
    true: 'One or more replicas failed to be created',
    false: 'All replicas are healthy',
  },
};

// ReplicaSet conditions
const REPLICASET_CONDITIONS: ConditionDescriptions = {
  'ReplicaFailure': {
    true: 'One or more pods failed to be created',
    false: 'All pods are healthy',
  },
};

// StatefulSet conditions (same as ReplicaSet)
const STATEFULSET_CONDITIONS: ConditionDescriptions = {
  ...REPLICASET_CONDITIONS,
};

// DaemonSet conditions
const DAEMONSET_CONDITIONS: ConditionDescriptions = {
  ...REPLICASET_CONDITIONS,
};

// Job conditions
const JOB_CONDITIONS: ConditionDescriptions = {
  'Complete': {
    true: 'Job has completed successfully',
    false: 'Job has not completed yet',
  },
  'Failed': {
    true: 'Job has failed',
    false: 'Job has not failed',
  },
  'Suspended': {
    true: 'Job is suspended',
    false: 'Job is not suspended',
  },
  'FailureTarget': {
    true: 'Job is about to fail',
    false: 'Job is not targeted for failure',
  },
  'SuccessCriteriaMet': {
    true: 'Job success criteria have been met',
    false: 'Job success criteria have not been met yet',
  },
};

// Node conditions
const NODE_CONDITIONS: ConditionDescriptions = {
  'Ready': {
    true: 'Node is healthy and ready to accept pods',
    false: 'Node is not ready to accept pods',
  },
  'MemoryPressure': {
    true: 'Node is running low on memory',
    false: 'Node has sufficient memory',
  },
  'DiskPressure': {
    true: 'Node is running low on disk space',
    false: 'Node has sufficient disk space',
  },
  'PIDPressure': {
    true: 'Node is running too many processes',
    false: 'Node has sufficient process capacity',
  },
  'NetworkUnavailable': {
    true: 'Node network is not configured correctly',
    false: 'Node network is configured correctly',
  },
};

// PersistentVolumeClaim conditions
const PVC_CONDITIONS: ConditionDescriptions = {
  'Resizing': {
    true: 'Volume is being resized',
    false: 'Volume is not being resized',
  },
  'FileSystemResizePending': {
    true: 'Filesystem resize is pending (requires pod restart)',
    false: 'No filesystem resize pending',
  },
};

// Certificate (cert-manager) conditions
const CERTIFICATE_CONDITIONS: ConditionDescriptions = {
  'Ready': {
    true: 'Certificate is valid and up to date',
    false: 'Certificate is not ready',
  },
  'Issuing': {
    true: 'Certificate is being issued or renewed',
    false: 'Certificate is not being issued',
  },
};

// Gateway API conditions
const GATEWAY_CONDITIONS: ConditionDescriptions = {
  'Accepted': {
    true: 'Gateway configuration has been accepted',
    false: 'Gateway configuration has not been accepted',
  },
  'Programmed': {
    true: 'Gateway is programmed and ready to route traffic',
    false: 'Gateway is not yet programmed',
  },
  'Ready': {
    true: 'Gateway is ready to route traffic',
    false: 'Gateway is not ready',
  },
};

// HTTPRoute/GRPCRoute conditions
const ROUTE_CONDITIONS: ConditionDescriptions = {
  'Accepted': {
    true: 'Route has been accepted by the gateway',
    false: 'Route has not been accepted',
  },
  'ResolvedRefs': {
    true: 'All references in the route have been resolved',
    false: 'Some references could not be resolved',
  },
};

// Map of resource kinds to their condition descriptions
const CONDITION_MAPS: Record<string, ConditionDescriptions> = {
  'Pod': POD_CONDITIONS,
  'Deployment': DEPLOYMENT_CONDITIONS,
  'ReplicaSet': REPLICASET_CONDITIONS,
  'StatefulSet': STATEFULSET_CONDITIONS,
  'DaemonSet': DAEMONSET_CONDITIONS,
  'Job': JOB_CONDITIONS,
  'CronJob': JOB_CONDITIONS,
  'Node': NODE_CONDITIONS,
  'PersistentVolumeClaim': PVC_CONDITIONS,
  'Certificate': CERTIFICATE_CONDITIONS,
  'CertificateRequest': CERTIFICATE_CONDITIONS,
  'Gateway': GATEWAY_CONDITIONS,
  'HTTPRoute': ROUTE_CONDITIONS,
  'GRPCRoute': ROUTE_CONDITIONS,
};

/**
 * Get a human-friendly description for a condition
 * @param kind - The Kubernetes resource kind (e.g., 'Pod', 'Deployment')
 * @param type - The condition type (e.g., 'Ready', 'Available')
 * @param status - The condition status ('True', 'False', 'Unknown')
 */
export function getConditionDescription(kind: string, type: string, status: string): string | undefined {
  const isTrue = status === 'True';
  
  // Try to find specific descriptions for this kind
  const kindMap = CONDITION_MAPS[kind];
  if (kindMap && kindMap[type]) {
    return isTrue ? kindMap[type].true : kindMap[type].false;
  }
  
  // Fallback: convert PascalCase to readable format
  const readable = type.replace(/([A-Z])/g, ' $1').trim();
  return `${readable} is ${status}`;
}

/**
 * Map raw conditions to ConditionData with descriptions
 */
export function mapConditions(
  kind: string,
  conditions: Array<{ type?: string; status?: string; reason?: string; message?: string }> | undefined
): ConditionData[] {
  if (!conditions) return [];
  
  return conditions.map(c => ({
    type: c.type || '',
    status: c.status || '',
    reason: c.reason,
    message: c.message,
    description: getConditionDescription(kind, c.type || '', c.status || ''),
  }));
}

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

export function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatMemory(value: string): string {
  const match = value.match(/^(\d+)(Ki|Mi|Gi|Ti|K|M|G|T)?$/);
  if (!match) return value;
  
  const num = parseInt(match[1], 10);
  const unit = match[2];
  
  if (!unit) {
    if (num >= 1024 * 1024 * 1024) return `${(num / (1024 * 1024 * 1024)).toFixed(1)}Gi`;
    if (num >= 1024 * 1024) return `${(num / (1024 * 1024)).toFixed(1)}Mi`;
    if (num >= 1024) return `${(num / 1024).toFixed(1)}Ki`;
    return `${num}B`;
  }
  
  if (unit === 'Ki' && num >= 1024 * 1024) return `${(num / (1024 * 1024)).toFixed(1)}Gi`;
  if (unit === 'Ki' && num >= 1024) return `${(num / 1024).toFixed(1)}Mi`;
  if (unit === 'Mi' && num >= 1024) return `${(num / 1024).toFixed(1)}Gi`;
  
  return value;
}

export function getAccessModeStyle(mode: string): string {
  switch (mode) {
    case 'ReadWriteOnce': return 'bg-blue-500/20 text-blue-400 border border-blue-500/30';
    case 'ReadOnlyMany': return 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
    case 'ReadWriteMany': return 'bg-purple-500/20 text-purple-400 border border-purple-500/30';
    case 'ReadWriteOncePod': return 'bg-amber-500/20 text-amber-400 border border-amber-500/30';
    default: return 'bg-gray-700 text-gray-300';
  }
}

export function formatAccessMode(mode: string): string {
  switch (mode) {
    case 'ReadWriteOnce': return 'RWO';
    case 'ReadOnlyMany': return 'ROX';
    case 'ReadWriteMany': return 'RWX';
    case 'ReadWriteOncePod': return 'RWOP';
    default: return mode;
  }
}

export function parseCronSchedule(schedule: string): string {
  const parts = schedule.split(' ');
  if (parts.length !== 5) return schedule;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  if (schedule === '* * * * *') return 'Every minute';
  if (schedule === '0 * * * *') return 'Every hour';
  if (schedule === '0 0 * * *') return 'Every day at midnight';
  if (schedule === '0 0 * * 0') return 'Every Sunday at midnight';
  if (schedule === '0 0 1 * *') return 'First day of every month at midnight';

  const descriptions: string[] = [];

  if (minute !== '*') descriptions.push(`at minute ${minute}`);
  if (hour !== '*') descriptions.push(`at hour ${hour}`);
  if (dayOfMonth !== '*') descriptions.push(`on day ${dayOfMonth}`);
  if (month !== '*') descriptions.push(`in month ${month}`);
  if (dayOfWeek !== '*') {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayNum = parseInt(dayOfWeek);
    descriptions.push(`on ${isNaN(dayNum) ? dayOfWeek : days[dayNum] || dayOfWeek}`);
  }

  return descriptions.length > 0 ? descriptions.join(', ') : 'Custom schedule';
}

// Common keys to filter out from labels
const INTERNAL_LABEL_KEYS = [
  'pod-template-hash',
  'controller-revision-hash',
];

// Common keys to filter out from annotations
const INTERNAL_ANNOTATION_KEYS = [
  'kubectl.kubernetes.io/last-applied-configuration',
  'deployment.kubernetes.io/revision',
  'deprecated.daemonset.template.generation',
  'kubernetes.io/description',
];

/**
 * Filter out internal Kubernetes labels
 */
export function filterLabels(
  labels: Record<string, string> | undefined,
  additionalExcludes: string[] = []
): Record<string, string> {
  if (!labels) return {};
  const excludes = [...INTERNAL_LABEL_KEYS, ...additionalExcludes];
  return Object.fromEntries(
    Object.entries(labels).filter(([key]) => 
      !excludes.some(exclude => key.includes(exclude))
    )
  );
}

/**
 * Filter out internal Kubernetes annotations
 */
export function filterAnnotations(
  annotations: Record<string, string> | undefined,
  additionalExcludes: string[] = []
): Record<string, string> {
  if (!annotations) return {};
  const excludes = [...INTERNAL_ANNOTATION_KEYS, ...additionalExcludes];
  return Object.fromEntries(
    Object.entries(annotations).filter(([key]) => 
      !excludes.some(exclude => key.includes(exclude) || key === exclude)
    )
  );
}

/**
 * Map a V1Container spec to ContainerData for display
 * Used for workload templates (Deployment, DaemonSet, StatefulSet, etc.)
 * that have container specs but no runtime status
 */
export function mapContainerSpec(container: V1Container): ContainerData {
  return {
    name: container.name,
    image: container.image || '',
    // No state/status info for template specs
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

type ContainerMetricsMap = Map<string, { cpu: { usage: string; usageNanoCores: number }; memory: { usage: string; usageBytes: number } }>;

/**
 * Create container sections from a pod template spec
 * Returns sections for init containers and regular containers
 */
export function getContainerSections(
  containers?: V1Container[],
  initContainers?: V1Container[],
  metricsLoader?: () => Promise<ContainerMetricsMap | null>,
): Section[] {
  const sections: Section[] = [];
  
  if (initContainers && initContainers.length > 0) {
    sections.push({
      id: 'init-containers',
      title: 'Init Containers',
      data: {
        type: 'containers' as const,
        items: initContainers.map(mapContainerSpec),
        // Init containers typically don't have live metrics
      },
    });
  }
  
  if (containers && containers.length > 0) {
    sections.push({
      id: 'containers',
      title: 'Containers',
      data: {
        type: 'containers' as const,
        items: containers.map(mapContainerSpec),
        metricsLoader,
      },
    });
  }
  
  return sections;
}

/**
 * Create standard label and annotation sections for a resource
 */
export function getStandardMetadataSections(
  metadata: { labels?: Record<string, string>; annotations?: Record<string, string> } | undefined,
  options?: {
    excludeLabels?: string[];
    excludeAnnotations?: string[];
  }
): Section[] {
  const sections: Section[] = [];
  
  const filteredLabels = filterLabels(metadata?.labels, options?.excludeLabels);
  const filteredAnnotations = filterAnnotations(metadata?.annotations, options?.excludeAnnotations);
  
  if (Object.keys(filteredLabels).length > 0) {
    sections.push({
      id: 'labels',
      data: {
        type: 'labels' as const,
        labels: filteredLabels,
        title: 'Labels',
      },
    });
  }
  
  if (Object.keys(filteredAnnotations).length > 0) {
    sections.push({
      id: 'annotations',
      data: {
        type: 'labels' as const,
        labels: filteredAnnotations,
        title: 'Annotations',
      },
    });
  }
  
  return sections;
}

/**
 * Aggregate resource quotas (requests and limits) from all containers
 */
export function aggregateResourceQuota(containers?: V1Container[]): ResourceQuotaData | null {
  if (!containers || containers.length === 0) return null;

  let cpuRequestsNanoCores = 0;
  let cpuLimitsNanoCores = 0;
  let memoryRequestsBytes = 0;
  let memoryLimitsBytes = 0;
  let hasCpuRequests = false;
  let hasCpuLimits = false;
  let hasMemoryRequests = false;
  let hasMemoryLimits = false;

  for (const container of containers) {
    const resources = container.resources;
    if (!resources) continue;

    const requests = resources.requests as Record<string, string> | undefined;
    const limits = resources.limits as Record<string, string> | undefined;

    if (requests?.cpu) {
      cpuRequestsNanoCores += parseCpuToNanoCores(requests.cpu);
      hasCpuRequests = true;
    }
    if (limits?.cpu) {
      cpuLimitsNanoCores += parseCpuToNanoCores(limits.cpu);
      hasCpuLimits = true;
    }
    if (requests?.memory) {
      memoryRequestsBytes += parseMemoryToBytes(requests.memory);
      hasMemoryRequests = true;
    }
    if (limits?.memory) {
      memoryLimitsBytes += parseMemoryToBytes(limits.memory);
      hasMemoryLimits = true;
    }
  }

  // Return null if no quota data at all
  if (!hasCpuRequests && !hasCpuLimits && !hasMemoryRequests && !hasMemoryLimits) {
    return null;
  }

  return {
    cpu: {
      requests: hasCpuRequests ? formatCpu(cpuRequestsNanoCores) : undefined,
      requestsNanoCores: hasCpuRequests ? cpuRequestsNanoCores : undefined,
      limits: hasCpuLimits ? formatCpu(cpuLimitsNanoCores) : undefined,
      limitsNanoCores: hasCpuLimits ? cpuLimitsNanoCores : undefined,
    },
    memory: {
      requests: hasMemoryRequests ? formatBytes(memoryRequestsBytes) : undefined,
      requestsBytes: hasMemoryRequests ? memoryRequestsBytes : undefined,
      limits: hasMemoryLimits ? formatBytes(memoryLimitsBytes) : undefined,
      limitsBytes: hasMemoryLimits ? memoryLimitsBytes : undefined,
    },
  };
}

/**
 * Create a resource quota section if containers have requests/limits defined
 */
export function getResourceQuotaSection(containers?: V1Container[]): Section | null {
  const quota = aggregateResourceQuota(containers);
  if (!quota) return null;

  return {
    id: 'resource-quota',
    data: {
      type: 'resource-quota' as const,
      data: quota,
    },
  };
}
