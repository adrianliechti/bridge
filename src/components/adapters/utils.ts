// Utility functions for visualizers

import type { Section, ContainerData } from './types';
import type { V1Container } from '@kubernetes/client-node';

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
