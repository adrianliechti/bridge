import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Sparkles } from 'lucide-react';
import type { DockerContainer, DockerImage, DockerVolume, DockerNetwork, DockerNetworkInspect } from '../../api/docker/docker';
import { 
  listContainers, listImages, listVolumes, listNetworks,
  dockerContainersToTable, dockerImagesToTable, dockerVolumesToTable, dockerNetworksToTable,
  formatContainerName 
} from '../../api/docker/docker';
import type { TableRow, ResourceConfig, TableResponse } from '../../types/table';
import { ResourcePage as BaseResourcePage } from '../ResourcePage';
import { ChatPanel } from '../ChatPanel';
import { createDockerChatAdapter, type DockerEnvironment } from './Chat';
import { ResourcePanel } from './ResourcePanel';
import { usePanels } from '../../hooks/usePanelState';
import { getConfig } from '../../config';
import { useDocker } from '../../hooks/useContext';

export type DockerResourceType = 'containers' | 'images' | 'volumes' | 'networks';

type DockerResourceObject = DockerContainer | DockerImage | DockerVolume | DockerNetwork | DockerNetworkInspect;

// Panel IDs
const PANEL_AI = 'ai';

// Refresh interval
const REFRESH_INTERVAL = 5000;

// Get stable sort key for each resource type
function getResourceSortKey(resource: DockerResourceObject, resourceType: DockerResourceType): string {
  switch (resourceType) {
    case 'containers':
      return (resource as DockerContainer).Id ?? '';
    case 'images':
      return (resource as DockerImage).Id ?? '';
    case 'volumes':
      return (resource as DockerVolume).Name ?? '';
    case 'networks':
      return (resource as DockerNetwork).Id ?? '';
    default:
      return '';
  }
}

interface ResourcePageProps {
  resourceType: DockerResourceType;
}

export function ResourcePage({ resourceType }: ResourcePageProps) {
  const [data, setData] = useState<TableRow<DockerResourceObject>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isRefetching, setIsRefetching] = useState(false);
  const isFirstFetch = useRef(true);
  const { isOpen, toggle, close } = usePanels();
  const isChatPanelOpen = isOpen(PANEL_AI);
  const { context: dockerContext } = useDocker();

  // Chat adapter
  const chatAdapter = createDockerChatAdapter();

  // Fetch Docker data
  const fetchData = useCallback(async (isBackground = false) => {
    // Only show loading on initial fetch
    if (!isBackground) {
      setLoading(true);
    }
    if (isBackground) {
      setIsRefetching(true);
    }

    try {
      let tableData: TableResponse<DockerResourceObject>;
      switch (resourceType) {
        case 'containers': {
          const containers = await listContainers(dockerContext, true);
          tableData = dockerContainersToTable(containers) as TableResponse<DockerResourceObject>;
          break;
        }
        case 'images': {
          const images = await listImages(dockerContext);
          tableData = dockerImagesToTable(images) as TableResponse<DockerResourceObject>;
          break;
        }
        case 'volumes': {
          const volumes = await listVolumes(dockerContext);
          tableData = dockerVolumesToTable(volumes) as TableResponse<DockerResourceObject>;
          break;
        }
        case 'networks': {
          const networks = await listNetworks(dockerContext);
          tableData = dockerNetworksToTable(networks) as TableResponse<DockerResourceObject>;
          break;
        }
      }
      // Sort rows by stable key to prevent order changes on refresh
      const sortedRows = [...tableData.rows].sort((a, b) => {
        const keyA = getResourceSortKey(a.object, resourceType);
        const keyB = getResourceSortKey(b.object, resourceType);
        return keyA.localeCompare(keyB);
      });
      setData(sortedRows);
      // Only clear error on initial fetch success
      if (!isBackground) {
        setError(null);
      }
    } catch (err) {
      // Only set error on initial fetch
      if (!isBackground) {
        setError(err instanceof Error ? err : new Error('Failed to fetch Docker data'));
      }
    } finally {
      setLoading(false);
      setIsRefetching(false);
    }
  }, [resourceType, dockerContext]);

  // Fetch data on mount and when resource type changes
  useEffect(() => {
    isFirstFetch.current = true;
    fetchData(false);
  }, [fetchData]);

  // Auto-refresh every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      // Only poll if initial fetch succeeded
      if (!isFirstFetch.current || data.length > 0) {
        fetchData(true);
      }
      isFirstFetch.current = false;
    }, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData, data.length]);

  // Build config and table data
  const config: ResourceConfig = useMemo(() => ({
    name: resourceType,
    namespaced: false,
  }), [resourceType]);

  const tableData = useMemo(() => {
    switch (resourceType) {
      case 'containers':
        return dockerContainersToTable(data.map(row => row.object as DockerContainer));
      case 'images':
        return dockerImagesToTable(data.map(row => row.object as DockerImage));
      case 'volumes':
        return dockerVolumesToTable(data.map(row => row.object as DockerVolume));
      case 'networks':
        return dockerNetworksToTable(data.map(row => row.object as DockerNetwork));
    }
  }, [resourceType, data]);

  const titleMap: Record<DockerResourceType, string> = {
    containers: 'Containers',
    images: 'Images',
    volumes: 'Volumes',
    networks: 'Networks',
  };
  const title = titleMap[resourceType];

  // Environment info for AI chat
  const getEnvironmentInfo = useCallback((item: TableRow<DockerResourceObject> | null): DockerEnvironment => {
    const container = item?.object as DockerContainer | undefined;
    return {
      context: dockerContext,
      selectedResourceType: resourceType,
      selectedContainerId: resourceType === 'containers' ? container?.Id?.substring(0, 12) : undefined,
      selectedContainerName: resourceType === 'containers' && container?.Names ? formatContainerName(container.Names) : undefined,
    };
  }, [resourceType, dockerContext]);

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
  const renderExtraPanels = useCallback((selectedItem: TableRow<DockerResourceObject> | null, isDetailPanelOpen: boolean) => {
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

  // Custom detail panel for Docker resources using the new ResourcePanel
  const showDetailPanel = resourceType === 'containers' || resourceType === 'images' || resourceType === 'volumes' || resourceType === 'networks';
  
  const renderDetailPanel = useMemo(() => showDetailPanel
    ? (item: TableRow<DockerResourceObject>, onClose: () => void, otherPanelOpen: boolean) => {
        return (
          <ResourcePanel
            isOpen={true}
            onClose={onClose}
            otherPanelOpen={otherPanelOpen || isChatPanelOpen}
            resource={item.object}
            resourceType={resourceType}
          />
        );
      }
    : undefined,
  [showDetailPanel, resourceType, isChatPanelOpen]);

  // Manual refetch (triggered by user)
  const refetch = useCallback(() => {
    fetchData(false);
  }, [fetchData]);

  return (
    <BaseResourcePage
      config={config}
      title={title}
      data={tableData as TableResponse<DockerResourceObject>}
      loading={loading}
      error={error}
      refetch={refetch}
      isRefetching={isRefetching}
      showDetailPanel={showDetailPanel}
      renderDetailPanel={renderDetailPanel}
      renderHeaderActions={renderHeaderActions}
      renderExtraPanels={renderExtraPanels}
    />
  );
}
