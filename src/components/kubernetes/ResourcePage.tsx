import { Sparkles } from 'lucide-react';
import type { V1APIResource } from '../../api/kubernetes/kubernetesTable';
import { getResourceTable } from '../../api/kubernetes/kubernetesTable';
import type { TableRow, KubernetesObject } from '../../types/table';
import { useKubernetesQuery } from '../../hooks/useKubernetesQuery';
import { ResourcePage as BaseResourcePage } from '../ResourcePage';
import { ResourcePanel } from './ResourcePanel';
import { getConfig } from '../../config';

type TabType = 'overview' | 'metadata' | 'yaml' | 'events' | 'logs' | 'terminal';

interface ResourcePageProps {
  resource: V1APIResource;
  context: string;
  namespace: string | undefined;
  selectedItem?: string;
  onSelectItem?: (name: string | undefined) => void;
  tab?: TabType;
  onTabChange?: (tab: TabType | undefined) => void;
  // Chat panel state from ClusterLayout
  isChatPanelOpen?: boolean;
  onToggleChatPanel?: () => void;
}

export function ResourcePage({
  resource,
  context,
  namespace,
  selectedItem,
  onSelectItem,
  tab,
  onTabChange,
  isChatPanelOpen = false,
  onToggleChatPanel,
}: ResourcePageProps) {
  // Fetch data using useKubernetesQuery
  const { data, loading, error, refetch, isRefetching } = useKubernetesQuery(
    ['kubernetes', 'resources', context, resource.group, resource.name, namespace],
    () => getResourceTable(context, resource, namespace),
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

  // Render AI chat button in header (toggles chat panel in ClusterLayout)
  const renderHeaderActions = () => {
    if (!getConfig().ai || !onToggleChatPanel) return null;
    return (
      <button
        onClick={onToggleChatPanel}
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

  // Render Kubernetes detail panel
  const renderDetailPanel = (
    item: TableRow<KubernetesObject>,
    onClose: () => void,
    otherPanelOpen: boolean,
  ) => {
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
      isChatPanelOpen={isChatPanelOpen}
      selectedItemName={selectedItem}
      onSelectItemName={onSelectItem}
      getItemName={getItemName}
    />
  );
}
