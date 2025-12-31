import { ContextSelector } from './ContextSelector';
import { Nav as KubernetesNav } from './kubernetes/Nav';
import { Nav as DockerNav, type DockerResourceType } from './docker/Nav';
import { useCluster } from '../hooks/useCluster';
import { useAppMode } from '../hooks/useAppMode';
import type { V1APIResource } from '../api/kubernetes/kubernetesTable';

// Re-export for use in App
export type { V1APIResource, DockerResourceType };

interface SidebarProps {
  // Kubernetes props
  selectedResource?: V1APIResource | null;
  onSelectResource?: (resource: V1APIResource | null) => void;
  isOverviewSelected?: boolean;
  // Docker props
  selectedDockerResource?: DockerResourceType;
  onSelectDockerResource?: (resource: DockerResourceType) => void;
}

export function Sidebar({
  selectedResource,
  onSelectResource,
  isOverviewSelected,
  selectedDockerResource,
  onSelectDockerResource,
}: SidebarProps) {
  const { mode } = useAppMode();
  const { context, contexts, setContext } = useCluster();

  return (
    <aside className="w-56 h-full shrink-0 bg-white dark:bg-black/40 backdrop-blur-xl flex flex-col rounded-xl border border-neutral-300/50 dark:border-neutral-700/50">
      {/* Header */}
      <div className="shrink-0 px-3 pt-3 pb-2">
        {/* Context Selector */}
        <ContextSelector
          contexts={contexts}
          selectedContext={context}
          onSelectContext={setContext}
        />
      </div>

      {/* Mode-specific navigation */}
      {mode === 'kubernetes' && onSelectResource && (
        <KubernetesNav
          selectedResource={selectedResource ?? null}
          onSelectResource={onSelectResource}
          isOverviewSelected={isOverviewSelected}
        />
      )}
      {mode === 'docker' && onSelectDockerResource && (
        <DockerNav
          selectedResource={selectedDockerResource ?? 'containers'}
          onSelectResource={onSelectDockerResource}
        />
      )}
    </aside>
  );
}
