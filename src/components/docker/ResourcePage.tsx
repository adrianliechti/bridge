import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import type { DockerContainer, DockerImage, DockerVolume, DockerNetwork, DockerNetworkInspect, ComposeApplication } from '../../api/docker/docker';
import { 
  listContainers, listImages, listVolumes, listNetworks, listApplications,
  dockerContainersToTable, dockerImagesToTable, dockerVolumesToTable, dockerNetworksToTable, dockerApplicationsToTable,
  formatContainerName 
} from '../../api/docker/docker';
import type { TableRow, ResourceConfig, TableResponse } from '../../types/table';
import { ResourcePage as BaseResourcePage } from '../ResourcePage';
import { ChatPanel } from '../ChatPanel';
import { 
  dockerAdapterConfig, 
  createDockerTools, 
  buildDockerInstructions,
  type DockerEnvironment 
} from './ChatAdapter';
import { ResourcePanel } from './ResourcePanel';
import { usePanels } from '../../hooks/usePanelState';
import { getConfig } from '../../config';

export type DockerResourceType = 'applications' | 'containers' | 'images' | 'volumes' | 'networks';

type DockerResourceObject = DockerContainer | DockerImage | DockerVolume | DockerNetwork | DockerNetworkInspect | ComposeApplication;

// Panel IDs
const PANEL_AI = 'ai';

// Get stable sort key for each resource type
function getResourceSortKey(resource: DockerResourceObject, resourceType: DockerResourceType): string {
  switch (resourceType) {
    case 'applications':
      return (resource as ComposeApplication).name ?? '';
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

// Get URL-friendly name for each resource type
function getResourceName(resource: DockerResourceObject, resourceType: DockerResourceType): string {
  switch (resourceType) {
    case 'applications':
      return (resource as ComposeApplication).name ?? '';
    case 'containers': {
      const container = resource as DockerContainer;
      return container.Names ? formatContainerName(container.Names) : container.Id?.substring(0, 12) ?? '';
    }
    case 'images': {
      const image = resource as DockerImage;
      // Use first repo tag or short ID
      return image.RepoTags?.[0]?.replace(/:/g, '-') ?? image.Id?.substring(7, 19) ?? '';
    }
    case 'volumes':
      return (resource as DockerVolume).Name ?? '';
    case 'networks':
      return (resource as DockerNetwork).Name ?? '';
    default:
      return '';
  }
}

// Fetch function for Docker resources
async function fetchDockerResources(
  dockerContext: string,
  resourceType: DockerResourceType
): Promise<TableRow<DockerResourceObject>[]> {
  let tableData: TableResponse<DockerResourceObject>;
  switch (resourceType) {
    case 'applications': {
      const applications = await listApplications(dockerContext);
      tableData = dockerApplicationsToTable(applications) as TableResponse<DockerResourceObject>;
      break;
    }
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
  return [...tableData.rows].sort((a, b) => {
    const keyA = getResourceSortKey(a.object, resourceType);
    const keyB = getResourceSortKey(b.object, resourceType);
    return keyA.localeCompare(keyB);
  });
}

interface ResourcePageProps {
  resourceType: DockerResourceType;
  context: string;
  selectedItem?: string;
  onSelectItem?: (name: string | undefined) => void;
}

export function ResourcePage({ resourceType, context: dockerContext, selectedItem, onSelectItem }: ResourcePageProps) {
  const { isOpen, toggle, close } = usePanels();
  const isChatPanelOpen = isOpen(PANEL_AI);

  // Fetch Docker data using TanStack Query
  const { data = [], isLoading: loading, error, refetch, isFetching } = useQuery({
    queryKey: ['docker', dockerContext, resourceType],
    queryFn: () => fetchDockerResources(dockerContext, resourceType),
    refetchInterval: 5000,
  });
  const isRefetching = isFetching && !loading;

  // Build config and table data
  const config: ResourceConfig = useMemo(() => ({
    name: resourceType,
    namespaced: false,
  }), [resourceType]);

  const tableData = useMemo(() => {
    switch (resourceType) {
      case 'applications':
        return dockerApplicationsToTable(data.map(row => row.object as ComposeApplication));
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
    applications: 'Applications',
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

  // Create tools for the current environment - memoized
  const tools = useMemo(() => {
    const env = getEnvironmentInfo(null);
    return createDockerTools(env);
  }, [getEnvironmentInfo]);

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
        adapterConfig={dockerAdapterConfig}
        environment={environmentInfo}
        tools={tools}
        buildInstructions={buildDockerInstructions}
      />
    );
  }, [isChatPanelOpen, close, getEnvironmentInfo, tools]);

  // Custom detail panel for Docker resources using the new ResourcePanel
  const showDetailPanel = resourceType === 'applications' || resourceType === 'containers' || resourceType === 'images' || resourceType === 'volumes' || resourceType === 'networks';
  
  const renderDetailPanel = useMemo(() => showDetailPanel
    ? (item: TableRow<DockerResourceObject>, onClose: () => void, otherPanelOpen: boolean) => {
        return (
          <ResourcePanel
            context={dockerContext}
            isOpen={true}
            onClose={onClose}
            otherPanelOpen={otherPanelOpen || isChatPanelOpen}
            resource={item.object}
            resourceType={resourceType}
          />
        );
      }
    : undefined,
  [showDetailPanel, resourceType, isChatPanelOpen, dockerContext]);

  // Get item name for URL sync
  const getItemName = useCallback((row: TableRow<DockerResourceObject>) => {
    return getResourceName(row.object, resourceType);
  }, [resourceType]);

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
      selectedItemName={selectedItem}
      onSelectItemName={onSelectItem}
      getItemName={getItemName}
    />
  );
}
