import { fetchApi } from './kubernetes';
import { getResourceConfigByQualifiedName } from './kubernetesDiscovery';

// Cache for metrics availability check
let metricsAvailable: boolean | null = null;
let metricsCheckPromise: Promise<boolean> | null = null;

/**
 * Check if metrics-server API is available in the cluster.
 * Uses discovery to check for metrics.k8s.io API group.
 * Results are cached to avoid repeated checks.
 */
export async function isMetricsAvailable(): Promise<boolean> {
  // Return cached result if available
  if (metricsAvailable !== null) {
    return metricsAvailable;
  }

  // Return in-flight promise if check is already running
  if (metricsCheckPromise) {
    return metricsCheckPromise;
  }

  metricsCheckPromise = (async () => {
    try {
      // Try to discover the 'pods' resource in metrics.k8s.io group
      const resource = await getResourceConfigByQualifiedName('pods.metrics.k8s.io');
      metricsAvailable = resource !== undefined;
      return metricsAvailable;
    } catch (e) {
      console.warn('Failed to check metrics availability:', e);
      metricsAvailable = false;
      return false;
    } finally {
      metricsCheckPromise = null;
    }
  })();

  return metricsCheckPromise;
}

/**
 * Reset the metrics availability cache.
 * Useful if the cluster configuration changes or metrics-server is installed/uninstalled.
 */
export function resetMetricsCache(): void {
  metricsAvailable = null;
  metricsCheckPromise = null;
}

export interface ContainerMetrics {
  name: string;
  usage: {
    cpu: string;
    memory: string;
  };
}

export interface PodMetrics {
  metadata: {
    name: string;
    namespace: string;
    creationTimestamp?: string;
  };
  timestamp: string;
  window: string;
  containers: ContainerMetrics[];
}

export interface PodMetricsList {
  kind: string;
  apiVersion: string;
  items: PodMetrics[];
}

export interface NodeMetrics {
  metadata: {
    name: string;
    creationTimestamp?: string;
  };
  timestamp: string;
  window: string;
  usage: {
    cpu: string;
    memory: string;
  };
}

export interface NodeMetricsList {
  kind: string;
  apiVersion: string;
  items: NodeMetrics[];
}

export interface AggregatedMetrics {
  cpu: {
    usageNanoCores: number;
    formatted: string;
  };
  memory: {
    usageBytes: number;
    formatted: string;
  };
  podCount: number;
  podMetrics: Array<{
    name: string;
    cpu: string;
    memory: string;
  }>;
}

export function parseCpuToNanoCores(cpu: string): number {
  if (!cpu) return 0;
  if (cpu.endsWith('n')) return parseInt(cpu.slice(0, -1), 10) || 0;
  if (cpu.endsWith('m')) return (parseInt(cpu.slice(0, -1), 10) || 0) * 1_000_000;
  const cores = parseFloat(cpu);
  return isNaN(cores) ? 0 : cores * 1_000_000_000;
}

export function parseMemoryToBytes(memory: string): number {
  if (!memory) return 0;
  
  const match = memory.match(/^(\d+(?:\.\d+)?)(Ki|Mi|Gi|Ti|K|M|G|T|k|m|g|t)?$/);
  if (!match) {
    const bytes = parseInt(memory, 10);
    return isNaN(bytes) ? 0 : bytes;
  }
  
  const value = parseFloat(match[1]);
  const unit = match[2];
  
  if (!unit) return value;
  
  switch (unit) {
    case 'Ki': return value * 1024;
    case 'Mi': return value * 1024 * 1024;
    case 'Gi': return value * 1024 * 1024 * 1024;
    case 'Ti': return value * 1024 * 1024 * 1024 * 1024;
    case 'K': case 'k': return value * 1000;
    case 'M': case 'm': return value * 1000 * 1000;
    case 'G': case 'g': return value * 1000 * 1000 * 1000;
    case 'T': case 't': return value * 1000 * 1000 * 1000 * 1000;
    default: return value;
  }
}

export function formatCpu(nanoCores: number): string {
  if (nanoCores >= 1_000_000_000) {
    const cores = nanoCores / 1_000_000_000;
    return cores >= 10 ? `${Math.round(cores)}` : `${cores.toFixed(1)}`;
  }
  return `${Math.round(nanoCores / 1_000_000)}m`;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}Gi`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)}Mi`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)}Ki`;
  return `${bytes}B`;
}

export function calculatePercentage(usage: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.min(100, Math.round((usage / limit) * 100));
}

export async function getPodMetrics(name: string, namespace: string): Promise<PodMetrics | null> {
  try {
    // Check if metrics API is available before making request
    if (!(await isMetricsAvailable())) {
      return null;
    }
    return await fetchApi<PodMetrics>(`/apis/metrics.k8s.io/v1beta1/namespaces/${namespace}/pods/${name}`);
  } catch {
    return null;
  }
}

export async function getNamespacePodMetrics(namespace: string): Promise<PodMetrics[]> {
  try {
    // Check if metrics API is available before making request
    if (!(await isMetricsAvailable())) {
      return [];
    }
    const response = await fetchApi<PodMetricsList>(`/apis/metrics.k8s.io/v1beta1/namespaces/${namespace}/pods`);
    return response.items || [];
  } catch {
    return [];
  }
}

export async function getPodMetricsBySelector(namespace: string, matchLabels: Record<string, string>): Promise<PodMetrics[]> {
  try {
    // Check if metrics API is available before making request
    if (!(await isMetricsAvailable())) {
      return [];
    }
    const labelSelector = Object.entries(matchLabels).map(([k, v]) => `${k}=${v}`).join(',');
    const response = await fetchApi<PodMetricsList>(
      `/apis/metrics.k8s.io/v1beta1/namespaces/${namespace}/pods?labelSelector=${encodeURIComponent(labelSelector)}`
    );
    return response.items || [];
  } catch {
    return [];
  }
}

export async function getNodeMetrics(name: string): Promise<NodeMetrics | null> {
  try {
    // Check if metrics API is available before making request
    if (!(await isMetricsAvailable())) {
      return null;
    }
    return await fetchApi<NodeMetrics>(`/apis/metrics.k8s.io/v1beta1/nodes/${name}`);
  } catch {
    return null;
  }
}

export async function getAllNodeMetrics(): Promise<NodeMetrics[]> {
  try {
    // Check if metrics API is available before making request
    if (!(await isMetricsAvailable())) {
      return [];
    }
    const response = await fetchApi<NodeMetricsList>(`/apis/metrics.k8s.io/v1beta1/nodes`);
    return response.items || [];
  } catch {
    return [];
  }
}

export function aggregatePodMetrics(pods: PodMetrics[]): AggregatedMetrics {
  let totalCpuNanos = 0;
  let totalMemoryBytes = 0;
  
  const podMetrics = pods.map(pod => {
    let podCpuNanos = 0;
    let podMemoryBytes = 0;
    
    pod.containers.forEach(container => {
      podCpuNanos += parseCpuToNanoCores(container.usage.cpu);
      podMemoryBytes += parseMemoryToBytes(container.usage.memory);
    });
    
    totalCpuNanos += podCpuNanos;
    totalMemoryBytes += podMemoryBytes;
    
    return {
      name: pod.metadata.name,
      cpu: formatCpu(podCpuNanos),
      memory: formatBytes(podMemoryBytes),
    };
  });
  
  return {
    cpu: { usageNanoCores: totalCpuNanos, formatted: formatCpu(totalCpuNanos) },
    memory: { usageBytes: totalMemoryBytes, formatted: formatBytes(totalMemoryBytes) },
    podCount: pods.length,
    podMetrics,
  };
}

export function sumContainerCpu(containers: ContainerMetrics[]): string {
  const totalNanos = containers.reduce((sum, c) => sum + parseCpuToNanoCores(c.usage.cpu), 0);
  return formatCpu(totalNanos);
}

export function sumContainerMemory(containers: ContainerMetrics[]): string {
  const totalBytes = containers.reduce((sum, c) => sum + parseMemoryToBytes(c.usage.memory), 0);
  return formatBytes(totalBytes);
}

/**
 * Aggregate metrics per container name across multiple pods.
 * Returns a Map where key is container name and value is the aggregated metrics.
 * This is useful for workload controllers (Deployment, DaemonSet, StatefulSet)
 * where multiple pods have containers with the same name.
 */
export function aggregateContainerMetrics(pods: PodMetrics[]): Map<string, { cpu: { usage: string; usageNanoCores: number }; memory: { usage: string; usageBytes: number } }> {
  const containerMap = new Map<string, { cpuNanos: number; memoryBytes: number; count: number }>();
  
  // Aggregate across all pods
  for (const pod of pods) {
    for (const container of pod.containers) {
      const existing = containerMap.get(container.name) || { cpuNanos: 0, memoryBytes: 0, count: 0 };
      existing.cpuNanos += parseCpuToNanoCores(container.usage.cpu);
      existing.memoryBytes += parseMemoryToBytes(container.usage.memory);
      existing.count++;
      containerMap.set(container.name, existing);
    }
  }
  
  // Convert to the expected format (show average per container if multiple pods)
  const result = new Map<string, { cpu: { usage: string; usageNanoCores: number }; memory: { usage: string; usageBytes: number } }>();
  
  for (const [name, data] of containerMap) {
    // Show total across all pods for workloads
    result.set(name, {
      cpu: { usage: formatCpu(data.cpuNanos), usageNanoCores: data.cpuNanos },
      memory: { usage: formatBytes(data.memoryBytes), usageBytes: data.memoryBytes },
    });
  }
  
  return result;
}
