import { useState, useEffect, useCallback, useMemo } from 'react';
import { Sparkles } from 'lucide-react';
import type { DockerContainer, DockerImage } from '../../api/docker/docker';
import { listContainers, listImages, dockerContainersToTable, dockerImagesToTable, formatContainerName } from '../../api/docker/docker';
import type { TableRow, ResourceConfig } from '../../types/table';
import { ResourcePage as BaseResourcePage } from '../ResourcePage';
import { ChatPanel } from '../ChatPanel';
import { createDockerChatAdapter, type DockerEnvironment } from './Chat';
import { ResourcePanel } from './ResourcePanel';
import { usePanels } from '../../hooks/usePanelState';
import { getConfig } from '../../config';

export type DockerResourceType = 'containers' | 'images';

// Panel IDs
const PANEL_AI = 'ai';

interface ResourcePageProps {
  resourceType: DockerResourceType;
}

export function ResourcePage({ resourceType }: ResourcePageProps) {
  const [data, setData] = useState<TableRow<DockerContainer | DockerImage>[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { isOpen, toggle, close } = usePanels();
  const isChatPanelOpen = isOpen(PANEL_AI);

  // Chat adapter
  const chatAdapter = createDockerChatAdapter();

  // Fetch Docker data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      if (resourceType === 'containers') {
        const containers = await listContainers(true);
        const tableData = dockerContainersToTable(containers);
        setData(tableData.rows);
      } else {
        const images = await listImages();
        const tableData = dockerImagesToTable(images);
        setData(tableData.rows);
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch Docker data'));
    } finally {
      setLoading(false);
    }
  }, [resourceType]);

  // Fetch data on mount and when resource type changes
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh every 5 seconds
  useEffect(() => {
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Build config and table data
  const config: ResourceConfig = useMemo(() => ({
    name: resourceType,
    namespaced: false,
  }), [resourceType]);

  const tableData = useMemo(() => 
    resourceType === 'containers'
      ? dockerContainersToTable(data.map(row => row.object as DockerContainer))
      : dockerImagesToTable(data.map(row => row.object as DockerImage)),
    [resourceType, data]
  );

  const title = resourceType === 'containers' ? 'Containers' : 'Images';

  // Environment info for AI chat
  const getEnvironmentInfo = useCallback((item: TableRow<DockerContainer | DockerImage> | null): DockerEnvironment => {
    const container = item?.object as DockerContainer | undefined;
    return {
      selectedResourceType: resourceType,
      selectedContainerId: container?.Id?.substring(0, 12),
      selectedContainerName: container?.Names ? formatContainerName(container.Names) : undefined,
    };
  }, [resourceType]);

  // Render AI chat button in header
  const renderHeaderActions = useCallback(() => {
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
  }, [isChatPanelOpen, toggle]);

  // Render chat panel
  const renderExtraPanels = useCallback((selectedItem: TableRow<DockerContainer | DockerImage> | null, isDetailPanelOpen: boolean) => {
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
  }, [isChatPanelOpen, close, chatAdapter, getEnvironmentInfo]);

  // Custom detail panel for Docker containers using the new ResourcePanel
  const renderDetailPanel = useMemo(() => resourceType === 'containers'
    ? (item: TableRow<DockerContainer | DockerImage>, onClose: () => void, otherPanelOpen: boolean) => {
        const container = item.object as DockerContainer;
        return (
          <ResourcePanel
            isOpen={true}
            onClose={onClose}
            otherPanelOpen={otherPanelOpen || isChatPanelOpen}
            resource={container}
          />
        );
      }
    : undefined,
  [resourceType, isChatPanelOpen]);

  return (
    <BaseResourcePage
      config={config}
      title={title}
      data={tableData}
      loading={loading}
      error={error}
      refetch={fetchData}
      showDetailPanel={resourceType === 'containers'}
      renderDetailPanel={renderDetailPanel}
      renderHeaderActions={renderHeaderActions}
      renderExtraPanels={renderExtraPanels}
    />
  );
}
