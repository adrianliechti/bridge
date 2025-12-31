import { Sparkles } from 'lucide-react';
import type { V1APIResource } from '../../api/kubernetes/kubernetesTable';
import { getResourceTable } from '../../api/kubernetes/kubernetesTable';
import type { TableRow, KubernetesObject } from '../../types/table';
import { useCluster } from '../../hooks/useCluster';
import { useKubernetesQuery } from '../../hooks/useKubernetesQuery';
import { usePanels } from '../../hooks/usePanelState';
import { ResourcePage as BaseResourcePage } from '../ResourcePage';
import { ChatPanel } from '../ChatPanel';
import { createKubernetesChatAdapter, type KubernetesEnvironment } from './Chat';
import { ResourcePanel } from './ResourcePanel';
import { getConfig } from '../../config';

// Panel IDs
const PANEL_AI = 'ai';

function getDisplayName(resource: V1APIResource): string {
  return resource.name.charAt(0).toUpperCase() + resource.name.slice(1);
}

interface ResourcePageProps {
  resource: V1APIResource;
}

export function ResourcePage({ resource }: ResourcePageProps) {
  const { context, namespace } = useCluster();
  const { isOpen, toggle, close } = usePanels();
  const isChatPanelOpen = isOpen(PANEL_AI);

  // Fetch data using useKubernetesQuery
  const { data, loading, error, refetch, isRefetching } = useKubernetesQuery(
    () => getResourceTable(context, resource, namespace),
    [context, resource, namespace]
  );

  // Extract Kubernetes resource info for detail panel
  const getResourceInfo = (item: TableRow<KubernetesObject>) => {
    if (!item.object.metadata) return null;
    return {
      name: item.object.metadata.name || '',
      namespace: item.object.metadata.namespace,
      uid: item.object.metadata.uid || '',
      resourceVersion: item.object.metadata.resourceVersion || '',
      kind: resource.kind,
      apiVersion: resource.group ? `${resource.group}/${resource.version}` : resource.version || '',
    };
  };

  // Chat adapter
  const chatAdapter = createKubernetesChatAdapter();

  // Environment info for AI chat
  const getEnvironmentInfo = (item: TableRow<KubernetesObject> | null): KubernetesEnvironment => ({
    currentContext: context,
    currentNamespace: item?.object.metadata?.namespace || namespace || 'all namespaces',
    selectedResourceKind: resource.group 
      ? `${resource.kind} (${resource.group}/${resource.version})` 
      : `${resource.kind} (${resource.version})`,
    selectedResourceName: item?.object.metadata?.name,
  });

  // Render AI chat button in header
  const renderHeaderActions = () => {
    if (!getConfig().ai) return null;
    return (
      <button
        onClick={() => toggle(PANEL_AI)}
        className={`p-2 rounded-md transition-colors ${
          isChatPanelOpen 
            ? 'text-sky-400 hover:text-sky-300 hover:bg-neutral-100 dark:hover:bg-neutral-800' 
            : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 dark:text-neutral-500 dark:hover:text-neutral-300 dark:hover:bg-neutral-800'
        }`}
        title="AI Assistant"
      >
        <Sparkles size={18} />
      </button>
    );
  };

  // Render chat panel
  const renderExtraPanels = (selectedItem: TableRow<KubernetesObject> | null, isDetailPanelOpen: boolean) => {
    const environmentInfo = getEnvironmentInfo(selectedItem);

    return (
      <ChatPanel 
        isOpen={isChatPanelOpen}
        onClose={() => close(PANEL_AI)}
        otherPanelOpen={isDetailPanelOpen}
        adapter={chatAdapter}
        environment={environmentInfo}
      />
    );
  };

  // Render Kubernetes detail panel
  const renderDetailPanel = (item: TableRow<KubernetesObject>, onClose: () => void, otherPanelOpen: boolean) => {
    const resourceInfo = getResourceInfo(item);
    return (
      <ResourcePanel
        isOpen={true}
        onClose={onClose}
        otherPanelOpen={otherPanelOpen || isChatPanelOpen}
        resource={resourceInfo}
      />
    );
  };

  return (
    <BaseResourcePage
      config={resource}
      title={getDisplayName(resource)}
      namespace={namespace}
      data={data}
      loading={loading}
      error={error}
      refetch={refetch}
      isRefetching={isRefetching}
      renderDetailPanel={renderDetailPanel}
      renderHeaderActions={renderHeaderActions}
      renderExtraPanels={renderExtraPanels}
    />
  );
}
