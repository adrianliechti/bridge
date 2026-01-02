import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Loader2 } from 'lucide-react';
import {
  inspectContainer,
  inspectVolume,
  inspectNetwork,
  type DockerContainer,
  type ContainerInspect,
  type DockerImage,
  type DockerVolume,
  type DockerNetwork,
  type DockerNetworkInspect,
  type ComposeApplication,
  formatContainerName,
} from '../../api/docker/docker';
import { ResourceVisualizer } from './ResourceVisualizer';
import { hasAdapter, getResourceActions } from './index';
import { DockerLogViewer } from './LogViewer';
import { LabelsSection } from '../sections/InfoSection';
import type { ResourceAction, DockerResource } from './adapters/types';

type ResourceType = 'applications' | 'containers' | 'images' | 'volumes' | 'networks';

interface ResourcePanelProps {
  context: string;
  isOpen: boolean;
  onClose: () => void;
  otherPanelOpen?: boolean;
  resource: DockerResource | null;
  resourceType?: ResourceType;
}

export function ResourcePanel({ context: dockerContext, isOpen, onClose, otherPanelOpen = false, resource, resourceType = 'containers' }: ResourcePanelProps) {
  const [fullObject, setFullObject] = useState<ContainerInspect | DockerImage | DockerVolume | DockerNetworkInspect | ComposeApplication | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'metadata' | 'logs'>('overview');
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ResourceAction | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  // Auto-refresh interval (5 seconds)
  const REFRESH_INTERVAL = 5000;

  // Get resource ID based on type
  const getResourceId = useCallback((res: DockerResource | null): string => {
    if (!res) return '';
    if (resourceType === 'applications') return (res as ComposeApplication).name ?? '';
    if (resourceType === 'containers') return (res as DockerContainer).Id ?? '';
    if (resourceType === 'images') return (res as DockerImage).Id ?? '';
    if (resourceType === 'volumes') return (res as DockerVolume).Name ?? '';
    if (resourceType === 'networks') return (res as DockerNetwork).Id ?? '';
    return '';
  }, [resourceType]);

  const resourceId = getResourceId(resource);

  // Get display name based on type
  const getDisplayName = useCallback((res: DockerResource | null): string => {
    if (!res) return '';
    if (resourceType === 'applications') {
      return (res as ComposeApplication).name ?? '';
    }
    if (resourceType === 'containers') {
      const container = res as DockerContainer;
      return formatContainerName(container.Names ?? []);
    }
    if (resourceType === 'images') {
      const image = res as DockerImage;
      const tag = image.RepoTags?.[0];
      if (tag) return tag;
      return image.Id?.replace('sha256:', '').substring(0, 12) ?? '';
    }
    if (resourceType === 'volumes') return (res as DockerVolume).Name ?? '';
    if (resourceType === 'networks') return (res as DockerNetwork).Name ?? '';
    return '';
  }, [resourceType]);

  const displayName = getDisplayName(resource);

  const fetchResourceData = useCallback(async () => {
    if (!resourceId) return;
    
    try {
      let data;
      if (resourceType === 'containers') {
        data = await inspectContainer(dockerContext, resourceId);
      } else if (resourceType === 'images') {
        // Images don't need separate inspect - use the resource directly
        return;
      } else if (resourceType === 'applications') {
        // Applications don't need separate inspect - use the resource directly
        return;
      } else if (resourceType === 'volumes') {
        data = await inspectVolume(dockerContext, resourceId);
      } else if (resourceType === 'networks') {
        data = await inspectNetwork(dockerContext, resourceId);
      }
      if (data) setFullObject(data);
    } catch {
      // Silent fail for background refreshes
    }
  }, [resourceId, resourceType, dockerContext]);

  // Auto-refresh polling
  useEffect(() => {
    if (!isOpen || !resourceId || !fullObject) return;
    // No auto-refresh for images or applications since they are already aggregated
    if (resourceType === 'images' || resourceType === 'applications') return;

    const interval = setInterval(() => {
      fetchResourceData();
    }, REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [isOpen, resourceId, fullObject, fetchResourceData, resourceType]);

  // Fetch the resource when it changes
  useEffect(() => {
    setActiveTab('overview');
    
    if (!resourceId) {
      setFullObject(null);
      setError(null);
      return;
    }

    // For images, use the resource directly (no inspect needed)
    if (resourceType === 'images') {
      setFullObject(resource as DockerImage);
      return;
    }

    // For applications, use the resource directly (already aggregated)
    if (resourceType === 'applications') {
      setFullObject(resource as ComposeApplication);
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        let data;
        if (resourceType === 'containers') {
          data = await inspectContainer(dockerContext, resourceId);
        } else if (resourceType === 'volumes') {
          data = await inspectVolume(dockerContext, resourceId);
        } else if (resourceType === 'networks') {
          data = await inspectNetwork(dockerContext, resourceId);
        }
        if (data) setFullObject(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch resource details');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [resourceId, resourceType, resource, dockerContext]);

  // Determine adapter type based on resource type
  const adapterType = resourceType === 'applications' ? 'application'
    : resourceType === 'containers' ? 'container' 
    : resourceType === 'images' ? 'image'
    : resourceType === 'volumes' ? 'volume' 
    : 'network';

  // Get actions for the resource
  const resourceActions = fullObject ? getResourceActions(fullObject, adapterType).filter(action => {
    // Filter by visibility
    if (action.isVisible && !action.isVisible(fullObject)) return false;
    return true;
  }) : [];

  // Handle action click
  const handleActionClick = async (action: ResourceAction) => {
    if (action.confirm) {
      setConfirmAction(action);
      return;
    }
    await executeAction(action);
  };

  // Execute action
  const executeAction = async (action: ResourceAction) => {
    if (!fullObject) return;
    
    setLoadingAction(action.id);
    setConfirmAction(null);
    
    try {
      await action.execute(dockerContext, fullObject);
      await fetchResourceData();
    } catch (err) {
      console.error('Action failed:', err);
    } finally {
      setLoadingAction(null);
    }
  };

  if (!isOpen) return null;

  // Only show logs tab for containers
  const showLogsTab = resourceType === 'containers';
  
  // Check if resource has labels for metadata tab
  const hasLabels = (() => {
    if (!fullObject) return false;
    if (resourceType === 'containers') {
      const container = fullObject as ContainerInspect;
      return container.Config?.Labels && Object.keys(container.Config.Labels).length > 0;
    }
    if (resourceType === 'images') {
      const image = fullObject as DockerImage;
      return image.Labels && Object.keys(image.Labels).length > 0;
    }
    if (resourceType === 'volumes') {
      const volume = fullObject as DockerVolume;
      return volume.Labels && Object.keys(volume.Labels).length > 0;
    }
    if (resourceType === 'networks') {
      const network = fullObject as DockerNetworkInspect;
      return network.Labels && Object.keys(network.Labels).length > 0;
    }
    return false;
  })();

  // Get labels for the current resource
  const getResourceLabels = (): Record<string, string> | undefined => {
    if (!fullObject) return undefined;
    if (resourceType === 'containers') {
      return (fullObject as ContainerInspect).Config?.Labels;
    }
    if (resourceType === 'images') {
      return (fullObject as DockerImage).Labels ?? undefined;
    }
    if (resourceType === 'volumes') {
      return (fullObject as DockerVolume).Labels ?? undefined;
    }
    if (resourceType === 'networks') {
      return (fullObject as DockerNetworkInspect).Labels ?? undefined;
    }
    return undefined;
  };
  
  const tabs: { id: 'overview' | 'metadata' | 'logs'; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    ...(hasLabels ? [{ id: 'metadata' as const, label: 'Metadata' }] : []),
    ...(showLogsTab ? [{ id: 'logs' as const, label: 'Logs' }] : []),
  ];

  // Only show overview tab if we have an adapter
  const showOverviewTab = hasAdapter(adapterType);

  return (
    <div 
      className={`fixed right-0 top-0 h-full bg-white dark:bg-neutral-900 border-l border-neutral-200 dark:border-neutral-700 shadow-xl z-30 flex flex-col transition-all duration-300 ${
        otherPanelOpen ? 'w-md' : 'w-xl'
      }`}
    >
      {/* Header */}
      <div className="shrink-0 h-14 flex items-center justify-between px-4 border-b border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <h2 className="font-semibold text-sm text-neutral-900 dark:text-neutral-100 truncate">
              {displayName || 'Resource'}
            </h2>
            {resource && (
              <span className="text-xs text-neutral-400 font-mono mt-0.5">
                {resourceId.substring(0, 12)}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 dark:hover:text-neutral-300 dark:hover:bg-neutral-800 transition-colors"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="shrink-0 border-b border-neutral-200 dark:border-neutral-800 flex items-center">
        <div className="flex">
          {tabs.filter(tab => tab.id !== 'overview' || showOverviewTab).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'text-neutral-900 dark:text-neutral-100 border-b-2 border-neutral-900 dark:border-neutral-100'
                  : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {/* Tab-specific action buttons */}
        <div className="ml-auto pr-4 flex items-center gap-1">
          {/* Portal target for child component toolbar actions */}
          <div ref={toolbarRef} className="flex items-center gap-1" />
          {activeTab === 'overview' && resourceActions.map(action => {
            const disabled = action.isDisabled?.(fullObject!);
            const isDisabled = disabled === true || typeof disabled === 'string';
            const disabledReason = typeof disabled === 'string' ? disabled : undefined;
            const isLoading = loadingAction === action.id;

            return (
              <button
                key={action.id}
                onClick={() => handleActionClick(action)}
                disabled={isDisabled || isLoading}
                title={disabledReason || action.label}
                className={`
                  flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded transition-colors
                  ${isDisabled || isLoading ? 'opacity-50 cursor-not-allowed' : ''}
                  ${action.variant === 'primary' 
                    ? 'text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-neutral-200 dark:hover:bg-neutral-800' 
                    : action.variant === 'warning'
                    ? 'text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 hover:bg-neutral-200 dark:hover:bg-neutral-800'
                    : action.variant === 'danger'
                    ? 'text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-neutral-200 dark:hover:bg-neutral-800'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-800'
                  }
                `}
              >
                {isLoading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  action.icon
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Confirmation Dialog */}
      {confirmAction && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-neutral-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
              {confirmAction.confirm?.title}
            </h3>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-6">
              {confirmAction.confirm?.message}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmAction(null)}
                className="px-4 py-2 text-sm font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => executeAction(confirmAction)}
                className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
                  confirmAction.variant === 'danger'
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : confirmAction.variant === 'warning'
                    ? 'bg-amber-600 hover:bg-amber-700 text-white'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                {confirmAction.confirm?.confirmLabel || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {loading && !fullObject ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 text-neutral-400 animate-spin" />
          </div>
        ) : error ? (
          <div className="p-4 text-red-500 text-sm">{error}</div>
        ) : !resource ? (
          <div className="p-4 text-neutral-500 text-sm">No resource selected</div>
        ) : (
          <>
            {activeTab === 'overview' && fullObject && (
              <div className="h-full overflow-auto p-4">
                <ResourceVisualizer
                  context={dockerContext}
                  resource={fullObject}
                  onActionComplete={fetchResourceData}
                  hideActions={true}
                  hideLabels={true}
                />
              </div>
            )}
            {activeTab === 'metadata' && fullObject && (
              <div className="h-full overflow-auto p-4">
                {getResourceLabels() && <LabelsSection labels={getResourceLabels()!} />}
              </div>
            )}
            {activeTab === 'logs' && resourceType === 'containers' && resource && (
              <DockerLogViewer context={dockerContext} container={resource as DockerContainer} toolbarRef={toolbarRef} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
