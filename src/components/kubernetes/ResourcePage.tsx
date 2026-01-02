import { useMemo, useCallback } from 'react';
import { Sparkles } from 'lucide-react';
import type { V1APIResource } from '../../api/kubernetes/kubernetesTable';
import { getResourceTable } from '../../api/kubernetes/kubernetesTable';
import type { TableRow, KubernetesObject } from '../../types/table';
import { useKubernetesQuery } from '../../hooks/useKubernetesQuery';
import { usePanels } from '../../hooks/usePanelState';
import { ResourcePage as BaseResourcePage } from '../ResourcePage';
import { ChatPanel } from '../ChatPanel';
import { 
  kubernetesAdapterConfig, 
  createKubernetesTools, 
  buildKubernetesInstructions,
  type KubernetesEnvironment 
} from './ChatAdapter';
import { ResourcePanel } from './ResourcePanel';
import { getConfig } from '../../config';

// Panel IDs
const PANEL_AI = 'ai';

type TabType = 'overview' | 'metadata' | 'yaml' | 'events' | 'logs' | 'terminal';

interface ResourcePageProps {
  resource: V1APIResource;
  context: string;
  namespace: string | undefined;
  selectedItem?: string;
  onSelectItem?: (name: string | undefined) => void;
  tab?: TabType;
  onTabChange?: (tab: TabType | undefined) => void;
}

export function ResourcePage({ resource, context, namespace, selectedItem, onSelectItem, tab, onTabChange }: ResourcePageProps) {
  const { isOpen, toggle, close } = usePanels();
  const isChatPanelOpen = isOpen(PANEL_AI);

  // Fetch data using useKubernetesQuery
  const { data, loading, error, refetch, isRefetching } = useKubernetesQuery(
    ['kubernetes', 'resources', context, resource.group, resource.name, namespace],
    () => getResourceTable(context, resource, namespace)
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

  // Environment info for AI chat
  const getEnvironmentInfo = useCallback((item: TableRow<KubernetesObject> | null): KubernetesEnvironment => ({
    currentContext: context,
    currentNamespace: item?.object.metadata?.namespace || namespace || 'all namespaces',
    selectedResourceKind: resource.group 
      ? `${resource.kind} (${resource.group}/${resource.version})` 
      : `${resource.kind} (${resource.version})`,
    selectedResourceName: item?.object.metadata?.name,
  }), [context, namespace, resource.kind, resource.group, resource.version]);

  // Create tools for the current environment - memoized
  const tools = useMemo(() => {
    const env = getEnvironmentInfo(null);
    return createKubernetesTools(env);
  }, [getEnvironmentInfo]);

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
        adapterConfig={kubernetesAdapterConfig}
        environment={environmentInfo}
        tools={tools}
        buildInstructions={buildKubernetesInstructions}
      />
    );
  };

  // Render Kubernetes detail panel
  const renderDetailPanel = (item: TableRow<KubernetesObject>, onClose: () => void, otherPanelOpen: boolean) => {
    const resourceInfo = getResourceInfo(item);
    return (
      <ResourcePanel
        context={context}
        isOpen={true}
        onClose={onClose}
        otherPanelOpen={otherPanelOpen || isChatPanelOpen}
        resource={resourceInfo}
        tab={tab}
        onTabChange={onTabChange}
      />
    );
  };

  // Get item name for URL sync
  const getItemName = (row: TableRow<KubernetesObject>) => {
    return row.object.metadata?.name || '';
  };

  return (
    <BaseResourcePage
      config={resource}
      title={resource.kind}
      namespace={namespace}
      data={data}
      loading={loading}
      error={error}
      refetch={refetch}
      isRefetching={isRefetching}
      renderDetailPanel={renderDetailPanel}
      renderHeaderActions={renderHeaderActions}
      renderExtraPanels={renderExtraPanels}
      selectedItemName={selectedItem}
      onSelectItemName={onSelectItem}
      getItemName={getItemName}
    />
  );
}
