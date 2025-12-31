import { LogViewer } from '../sections/LogViewer';
import { useKubernetesLogs } from '../../hooks/useKubernetesLogs';
import { useCluster } from '../../hooks/useCluster';
import type { KubernetesResource } from '../../api/kubernetes/kubernetes';

export interface KubernetesLogViewerProps {
  resource: KubernetesResource;
  toolbarRef?: React.RefObject<HTMLDivElement | null>;
}

// Inner component that handles log streaming
function KubernetesLogViewerInner({ 
  resource,
  toolbarRef,
}: KubernetesLogViewerProps) {
  const { context } = useCluster();
  
  const { logs, sources, isLoading, error } = useKubernetesLogs({
    context,
    resource,
  });

  return (
    <LogViewer
      logs={logs}
      sources={sources}
      isLoading={isLoading}
      error={error}
      emptyMessage="Waiting for logs..."
      toolbarRef={toolbarRef}
    />
  );
}

// Generate a stable key for the resource
function getResourceKey(resource: KubernetesResource): string {
  return `${resource.kind}/${resource.metadata?.namespace}/${resource.metadata?.name}`;
}

// Wrapper component that uses key to reset inner state when resource changes
export function KubernetesLogViewer({ resource, toolbarRef }: KubernetesLogViewerProps) {
  return (
    <KubernetesLogViewerInner 
      key={getResourceKey(resource)} 
      resource={resource} 
      toolbarRef={toolbarRef} 
    />
  );
}
