import { useState, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Loader2, LayoutDashboard, Tags, ScrollText, SquareTerminal } from 'lucide-react';
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
import { DockerTerminalViewer } from './TerminalViewer';
import { LabelsSection } from '../sections/InfoSection';
import { DetailPanel, type DetailTab } from '../DetailPanel';
import { formatDockerContext } from '../../config';
import type { ResourceAction, DockerResource } from './adapters/types';

type ResourceType = 'applications' | 'containers' | 'images' | 'volumes' | 'networks';

interface ResourcePanelProps {
  context: string;
  isOpen: boolean;
  onClose: () => void;
  resource: DockerResource | null;
  resourceType?: ResourceType;
}

type InspectedObject =
  | ContainerInspect
  | DockerImage
  | DockerVolume
  | DockerNetworkInspect
  | ComposeApplication;

export function ResourcePanel({
  context: dockerContext,
  isOpen,
  onClose,
  resource,
  resourceType = 'containers',
}: ResourcePanelProps) {
  const [requestedTab, setActiveTab] = useState<'overview' | 'metadata' | 'logs' | 'terminal'>(
    'overview',
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ResourceAction | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  const queryClient = useQueryClient();

  // Get resource ID based on type
  const getResourceId = useCallback(
    (res: DockerResource | null): string => {
      if (!res) return '';
      if (resourceType === 'applications') return (res as ComposeApplication).name ?? '';
      if (resourceType === 'containers') return (res as DockerContainer).Id ?? '';
      if (resourceType === 'images') return (res as DockerImage).Id ?? '';
      if (resourceType === 'volumes') return (res as DockerVolume).Name ?? '';
      if (resourceType === 'networks') return (res as DockerNetwork).Id ?? '';
      return '';
    },
    [resourceType],
  );

  const resourceId = getResourceId(resource);

  // Get display name based on type
  const getDisplayName = useCallback(
    (res: DockerResource | null): string => {
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
    },
    [resourceType],
  );

  const displayName = getDisplayName(resource);

  // Images and applications are already aggregated by the list call; there is
  // no separate inspect endpoint to hit, so display the row object directly.
  const isPreaggregated = resourceType === 'images' || resourceType === 'applications';

  const details = useQuery({
    queryKey: ['docker', dockerContext, resourceType, resourceId],
    queryFn: async () => {
      if (resourceType === 'containers') return inspectContainer(dockerContext, resourceId);
      if (resourceType === 'volumes') return inspectVolume(dockerContext, resourceId);
      if (resourceType === 'networks') return inspectNetwork(dockerContext, resourceId);
      return null;
    },
    enabled: isOpen && !!resourceId && !isPreaggregated,
  });
  const fullObject: InspectedObject | null = isPreaggregated
    ? (resource as DockerImage | ComposeApplication | null)
    : (details.data ?? null);
  // Keep the current view during a failed background refresh.
  const error = !fullObject ? details.error?.message : null;

  const refreshResource = () =>
    queryClient.invalidateQueries({ queryKey: ['docker', dockerContext, resourceType] });

  // Determine adapter type based on resource type
  const adapterType =
    resourceType === 'applications'
      ? 'application'
      : resourceType === 'containers'
        ? 'container'
        : resourceType === 'images'
          ? 'image'
          : resourceType === 'volumes'
            ? 'volume'
            : 'network';

  // Get actions for the resource
  const resourceActions = fullObject
    ? getResourceActions(fullObject, adapterType).filter((action) => {
        // Filter by visibility
        if (action.isVisible && !action.isVisible(fullObject)) return false;
        return true;
      })
    : [];

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
    if (!fullObject || loadingAction) return;

    setActionError(null);
    setLoadingAction(action.id);
    setConfirmAction(null);

    try {
      await action.execute(dockerContext, fullObject);
      await refreshResource();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setLoadingAction(null);
    }
  };

  if (!isOpen) return null;

  // Only show logs tab for containers
  const showLogsTab = resourceType === 'containers';

  // Only show terminal tab for running containers
  const showTerminalTab =
    resourceType === 'containers' && (resource as DockerContainer | null)?.State === 'running';

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

  const labels = getResourceLabels();

  const tabs: DetailTab<'overview' | 'metadata' | 'logs' | 'terminal'>[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'metadata', label: 'Metadata', icon: Tags },
    ...(showLogsTab ? [{ id: 'logs' as const, label: 'Logs', icon: ScrollText }] : []),
    ...(showTerminalTab
      ? [{ id: 'terminal' as const, label: 'Terminal', icon: SquareTerminal }]
      : []),
  ];

  const activeTab = tabs.some((tab) => tab.id === requestedTab) ? requestedTab : 'overview';

  // Only show overview tab if we have an adapter
  const showOverviewTab = hasAdapter(adapterType);

  return (
    <DetailPanel
      name={displayName || 'Resource'}
      kind={adapterType.charAt(0).toUpperCase() + adapterType.slice(1)}
      context={formatDockerContext(dockerContext)}
      scope={resourceType === 'containers' ? resourceId.substring(0, 12) : undefined}
      onClose={onClose}
      tabs={tabs.filter((tab) => tab.id !== 'overview' || showOverviewTab)}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      toolbar={<div ref={toolbarRef} className="flex items-center gap-1" />}
      actions={
        <>
          {activeTab === 'overview' &&
            resourceActions.map((action) => {
              const disabled = action.isDisabled?.(fullObject!);
              const isDisabled = disabled === true || typeof disabled === 'string';
              const disabledReason = typeof disabled === 'string' ? disabled : undefined;
              const isLoading = loadingAction === action.id;

              return (
                <button
                  key={action.id}
                  onClick={() => handleActionClick(action)}
                  disabled={isDisabled || loadingAction !== null}
                  title={disabledReason || action.label}
                  aria-label={action.label}
                  className={`
                  flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors [&>svg]:size-4 focus-visible:outline-2 focus-visible:outline-blue-500
                  ${isDisabled || isLoading ? 'opacity-50 cursor-not-allowed' : ''}
                  ${
                    action.variant === 'primary'
                      ? 'text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-neutral-200 dark:hover:bg-neutral-800'
                      : action.variant === 'warning'
                        ? 'text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 hover:bg-neutral-200 dark:hover:bg-neutral-800'
                        : action.variant === 'danger'
                          ? 'text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-neutral-200 dark:hover:bg-neutral-800'
                          : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-800'
                  }
                `}
                >
                  {isLoading ? <Loader2 size={14} className="animate-spin" /> : action.icon}
                </button>
              );
            })}
        </>
      }
    >
      {actionError && (
        <div
          role="alert"
          className="flex items-start justify-between gap-2 px-4 py-3 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10"
        >
          <span className="break-words min-w-0">{actionError}</span>
          <button type="button" onClick={() => setActionError(null)} aria-label="Dismiss error">
            <X size={14} />
          </button>
        </div>
      )}

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
        {details.isLoading && !fullObject ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 text-neutral-400 animate-spin" />
          </div>
        ) : error ? (
          <div role="alert" className="p-4 text-red-500 text-sm">
            {error}
            <button
              type="button"
              onClick={() => void details.refetch()}
              disabled={details.isFetching}
              className="ml-3 underline disabled:opacity-50"
            >
              {details.isFetching ? 'Retrying...' : 'Retry'}
            </button>
          </div>
        ) : !resource ? (
          <div className="p-4 text-neutral-500 text-sm">No resource selected</div>
        ) : (
          <>
            {activeTab === 'overview' && fullObject && (
              <div className="@container h-full overflow-auto p-5">
                <ResourceVisualizer
                  context={dockerContext}
                  resource={fullObject}
                  onActionComplete={refreshResource}
                  hideActions={true}
                  hideLabels={true}
                />
              </div>
            )}
            {activeTab === 'metadata' && fullObject && (
              <div className="h-full overflow-auto p-5">
                <LabelsSection labels={labels ?? {}} />
              </div>
            )}
            {activeTab === 'logs' && resourceType === 'containers' && resource && (
              <DockerLogViewer
                context={dockerContext}
                container={resource as DockerContainer}
                toolbarRef={toolbarRef}
              />
            )}
            {activeTab === 'terminal' && resourceType === 'containers' && resource && (
              <DockerTerminalViewer
                context={dockerContext}
                container={resource as DockerContainer}
              />
            )}
          </>
        )}
      </div>
    </DetailPanel>
  );
}
