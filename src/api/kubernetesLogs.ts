// Kubernetes pod log streaming API

export interface LogStreamOptions {
  context: string;
  namespace: string;
  podNames: string[];
  container?: string;
  follow?: boolean;
  tailLines?: number;
  timestamps?: boolean;
  onLog: (log: LogEntry) => void;
  onError?: (error: Error) => void;
}

export interface LogEntry {
  podName: string;
  container?: string;
  timestamp?: string;
  message: string;
}

// Parse a log line with optional timestamp
function parseLogLine(line: string, podName: string, container?: string): LogEntry {
  // Kubernetes timestamps look like: 2024-01-15T10:30:45.123456789Z
  const timestampMatch = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z)\s+(.*)$/);
  if (timestampMatch) {
    return {
      podName,
      container,
      timestamp: timestampMatch[1],
      message: timestampMatch[2],
    };
  }
  return {
    podName,
    container,
    message: line,
  };
}

// Stream logs from a single pod
async function streamPodLogs(
  context: string,
  namespace: string,
  podName: string,
  options: {
    container?: string;
    follow?: boolean;
    tailLines?: number;
    timestamps?: boolean;
    onLog: (log: LogEntry) => void;
    onError?: (error: Error) => void;
    signal?: AbortSignal;
  }
): Promise<void> {
  const params = new URLSearchParams();
  
  if (options.container) {
    params.set('container', options.container);
  }
  if (options.follow) {
    params.set('follow', 'true');
  }
  if (options.tailLines !== undefined) {
    params.set('tailLines', String(options.tailLines));
  }
  if (options.timestamps) {
    params.set('timestamps', 'true');
  }

  const url = `/contexts/${context}/api/v1/namespaces/${namespace}/pods/${podName}/log?${params.toString()}`;

  try {
    const response = await fetch(url, { signal: options.signal });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch logs: ${response.status} ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error('No response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      
      // Process complete lines
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer
      
      for (const line of lines) {
        if (line.trim()) {
          options.onLog(parseLogLine(line, podName, options.container));
        }
      }
    }

    // Process any remaining buffer
    if (buffer.trim()) {
      options.onLog(parseLogLine(buffer, podName, options.container));
    }
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      return; // Expected when cancelled
    }
    options.onError?.(error as Error);
  }
}

// Stream combined logs from multiple pods
export function streamCombinedLogs(options: LogStreamOptions): AbortController {
  const controller = new AbortController();
  
  // Start streaming from all pods in parallel
  for (const podName of options.podNames) {
    streamPodLogs(options.context, options.namespace, podName, {
      container: options.container,
      follow: options.follow,
      tailLines: options.tailLines,
      timestamps: options.timestamps,
      onLog: options.onLog,
      onError: options.onError,
      signal: controller.signal,
    });
  }

  return controller;
}

// Get available containers for a pod
export async function getPodContainers(context: string, namespace: string, podName: string): Promise<string[]> {
  const url = `/contexts/${context}/api/v1/namespaces/${namespace}/pods/${podName}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch pod: ${response.status}`);
  }
  
  const pod = await response.json();
  const containers: string[] = [];
  
  // Add init containers
  if (pod.spec?.initContainers) {
    for (const c of pod.spec.initContainers) {
      containers.push(c.name);
    }
  }
  
  // Add regular containers
  if (pod.spec?.containers) {
    for (const c of pod.spec.containers) {
      containers.push(c.name);
    }
  }
  
  return containers;
}

// Get pods for a workload (deployment, daemonset, replicaset, etc.)
export async function getWorkloadPods(
  context: string,
  namespace: string,
  workloadKind: string,
  workloadName: string
): Promise<string[]> {
  // Fetch the workload to get selector labels
  let apiPath: string;
  switch (workloadKind.toLowerCase()) {
    case 'deployment':
      apiPath = `/apis/apps/v1/namespaces/${namespace}/deployments/${workloadName}`;
      break;
    case 'daemonset':
      apiPath = `/apis/apps/v1/namespaces/${namespace}/daemonsets/${workloadName}`;
      break;
    case 'replicaset':
      apiPath = `/apis/apps/v1/namespaces/${namespace}/replicasets/${workloadName}`;
      break;
    case 'statefulset':
      apiPath = `/apis/apps/v1/namespaces/${namespace}/statefulsets/${workloadName}`;
      break;
    case 'job':
      apiPath = `/apis/batch/v1/namespaces/${namespace}/jobs/${workloadName}`;
      break;
    default:
      throw new Error(`Unsupported workload kind: ${workloadKind}`);
  }

  const workloadResponse = await fetch(`/contexts/${context}${apiPath}`);
  if (!workloadResponse.ok) {
    throw new Error(`Failed to fetch ${workloadKind}: ${workloadResponse.status}`);
  }
  
  const workload = await workloadResponse.json();
  const matchLabels = workload.spec?.selector?.matchLabels;
  
  if (!matchLabels) {
    throw new Error('Workload has no selector labels');
  }

  // Build label selector
  const labelSelector = Object.entries(matchLabels)
    .map(([k, v]) => `${k}=${v}`)
    .join(',');

  // Fetch pods with matching labels
  const podsResponse = await fetch(
    `/contexts/${context}/api/v1/namespaces/${namespace}/pods?labelSelector=${encodeURIComponent(labelSelector)}`
  );
  
  if (!podsResponse.ok) {
    throw new Error(`Failed to fetch pods: ${podsResponse.status}`);
  }

  const podList = await podsResponse.json();
  return podList.items.map((pod: { metadata: { name: string } }) => pod.metadata.name);
}
