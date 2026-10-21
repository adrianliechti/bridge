import {
  X,
  Loader2,
  RefreshCw,
  Check,
  LayoutDashboard,
  Tags,
  FileCode2,
  Activity,
  ScrollText,
  SquareTerminal,
} from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import type { V1ObjectReference } from '@kubernetes/client-node';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getResource,
  getResourceEvents,
  updateResource,
  type KubernetesResource,
} from '../../api/kubernetes/kubernetes';
import { getResourceConfigByKind } from '../../api/kubernetes/kubernetesDiscovery';
import { ResourceVisualizer } from './ResourceVisualizer';
import { hasAdapter, getResourceActions } from './index';
import type { ResourceAction } from './adapters/types';
import { KubernetesLogViewer } from './LogViewer';
import { TerminalViewer } from './TerminalViewer';
import { MetadataView } from '../sections';
import { EventsView } from './EventsView';
import { ManifestEditor } from './ManifestEditor';
import { DetailPanel, type DetailTab } from '../DetailPanel';

type TabType = 'overview' | 'metadata' | 'yaml' | 'events' | 'logs' | 'terminal';

interface ResourcePanelProps {
  context: string;
  isOpen: boolean;
  onClose: () => void;
  resource: V1ObjectReference | null;
  tab?: TabType;
  onTabChange?: (tab: TabType | undefined) => void;
}

// Metadata fields to hide from the detail panel
const HIDDEN_METADATA_FIELDS = new Set(['managedFields']);

// Filter hidden fields from metadata for display
function filterHiddenMetadataFields(obj: KubernetesResource): KubernetesResource {
  const meta = obj.metadata;
  if (!meta) return obj;

  const filteredMeta = Object.fromEntries(
    Object.entries(meta).filter(([key]) => !HIDDEN_METADATA_FIELDS.has(key)),
  );

  return {
    ...obj,
    metadata: filteredMeta,
  };
}

export function ResourcePanel({
  context,
  isOpen,
  onClose,
  resource: resourceId,
  tab: urlTab,
  onTabChange,
}: ResourcePanelProps) {
  const queryClient = useQueryClient();
  // Fallback tab state for callers that don't sync the tab to the URL.
  // When onTabChange is provided, the URL (urlTab) is the source of truth.
  const [localTab, setLocalTab] = useState<TabType | undefined>(undefined);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ResourceAction | null>(null);
  const [inputAction, setInputAction] = useState<ResourceAction | null>(null);
  const [inputValues, setInputValues] = useState<Record<string, string | number>>({});
  const resourceConfigRef = useRef<Awaited<ReturnType<typeof getResourceConfigByKind>> | null>(
    null,
  );
  const toolbarRef = useRef<HTMLDivElement>(null);
  const sliderPopoverRef = useRef<HTMLDivElement>(null);

  // Close slider popover on click outside
  useEffect(() => {
    if (!inputAction || inputAction.input?.type !== 'slider') return;

    const handleClickOutside = (e: MouseEvent) => {
      if (sliderPopoverRef.current && !sliderPopoverRef.current.contains(e.target as Node)) {
        setInputAction(null);
        setInputValues({});
      }
    };

    // Delay to avoid immediate close from the click that opened it
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [inputAction]);

  // Fetch resource data using React Query with structural sharing
  const {
    data: fullObject,
    isLoading: loading,
    error: resourceError,
    refetch: refetchResource,
  } = useQuery({
    queryKey: [
      'kubernetes',
      'resource',
      context,
      resourceId?.kind,
      resourceId?.apiVersion,
      resourceId?.name,
      resourceId?.namespace,
    ],
    queryFn: async () => {
      if (!resourceId || !resourceId.name || !resourceId.kind) return null;
      const config = await getResourceConfigByKind(context, resourceId.kind, resourceId.apiVersion);
      if (!config) throw new Error(`Unknown resource kind: ${resourceId.kind}`);
      resourceConfigRef.current = config;
      return getResource(context, config, resourceId.name, resourceId.namespace);
    },
    enabled: isOpen && !!resourceId?.name && !!resourceId?.kind,
  });

  // Fetch events using React Query
  const {
    data: events = [],
    isLoading: eventsLoading,
    error: eventsError,
    refetch: refetchEvents,
  } = useQuery({
    queryKey: ['kubernetes', 'events', context, resourceId?.name, resourceId?.namespace],
    queryFn: async () => {
      if (!resourceId?.name) return [];
      return getResourceEvents(context, resourceId.name, resourceId.namespace);
    },
    enabled: isOpen && !!resourceId?.name,
  });

  const error =
    resourceError instanceof Error
      ? resourceError.message
      : resourceError
        ? String(resourceError)
        : null;

  // Get actions for the current resource
  const resourceActions = fullObject ? getResourceActions(fullObject) : [];

  const executeAction = async (
    action: ResourceAction,
    values?: Record<string, string | number>,
  ) => {
    if (!fullObject || loadingAction) return;
    setActionError(null);
    setLoadingAction(action.id);
    try {
      await action.execute(context, fullObject!, values);
      await Promise.all([
        refetchResource(),
        queryClient.invalidateQueries({ queryKey: ['kubernetes', 'resources', context] }),
      ]);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setLoadingAction(null);
      setConfirmAction(null);
      setInputAction(null);
      setInputValues({});
    }
  };

  const handleActionClick = (action: ResourceAction) => {
    if (action.input) {
      // Initialize input value with default
      const defaultValue = action.input.defaultValue
        ? action.input.defaultValue(fullObject)
        : action.input.type === 'text'
          ? ''
          : 0;
      setInputValues({ value: defaultValue });
      setInputAction(action);
    } else if (action.confirm) {
      setConfirmAction(action);
    } else {
      executeAction(action);
    }
  };

  const handleSaveResource = useCallback(
    async (updatedResource: KubernetesResource) => {
      if (!resourceId || !resourceId.name || !resourceConfigRef.current) {
        throw new Error('Resource configuration not available');
      }

      await updateResource(
        context,
        resourceConfigRef.current,
        resourceId.name,
        updatedResource,
        resourceId.namespace,
      );

      // Refetch to get the updated resource from the server
      refetchResource();
    },
    [context, resourceId, refetchResource],
  );

  // Wrapper to update both local state and URL
  const setActiveTab = useCallback(
    (tab: TabType) => {
      setLocalTab(tab);
      onTabChange?.(tab);
    },
    [onTabChange],
  );

  // Determine which tabs are available for the current resource (static checks)
  const kind = resourceId?.kind || '';
  const hasCustomAdapter = hasAdapter(kind);
  const LOGGABLE_KINDS = ['Pod', 'Deployment', 'DaemonSet', 'ReplicaSet', 'StatefulSet', 'Job'];
  const supportsLogs = LOGGABLE_KINDS.includes(kind) && !!resourceId?.namespace;
  const supportsTerminal = kind === 'Pod' && !!resourceId?.namespace;

  const tabs: DetailTab<TabType>[] = [
    ...(hasCustomAdapter
      ? [{ id: 'overview' as const, label: 'Overview', icon: LayoutDashboard }]
      : []),
    { id: 'metadata', label: 'Metadata', icon: Tags },
    { id: 'yaml', label: 'Manifest', icon: FileCode2 },
    { id: 'events', label: 'Events', icon: Activity, count: events.length },
    ...(supportsLogs ? [{ id: 'logs' as const, label: 'Logs', icon: ScrollText }] : []),
    ...(supportsTerminal
      ? [{ id: 'terminal' as const, label: 'Terminal', icon: SquareTerminal }]
      : []),
  ];
  const defaultTab: TabType = hasCustomAdapter ? 'overview' : 'yaml';
  const requestedTab = onTabChange ? urlTab : localTab;
  const activeTab = tabs.some((tab) => tab.id === requestedTab) ? requestedTab! : defaultTab;

  if (!isOpen || !resourceId || !resourceId.name) return null;

  const rawObject = fullObject;

  // Filter out hidden metadata fields for display
  const displayObject = rawObject ? filterHiddenMetadataFields(rawObject) : null;
  const resourceName = resourceId.name;

  return (
    <DetailPanel
      name={resourceName}
      kind={kind}
      context={context}
      scope={resourceId.namespace || 'Cluster-scoped'}
      onClose={onClose}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      toolbar={<div ref={toolbarRef} className="flex items-center gap-1" />}
      actions={
        <>
          {activeTab === 'overview' && resourceActions.length > 0 && (
            <>
              {resourceActions.map((action) => {
                const disabled = action.isDisabled?.(fullObject!);
                const isDisabled = disabled === true || typeof disabled === 'string';
                const disabledReason = typeof disabled === 'string' ? disabled : undefined;
                const isLoading = loadingAction === action.id;
                const isSliderOpen =
                  inputAction?.id === action.id && action.input?.type === 'slider';

                return (
                  <div key={action.id} className="relative">
                    <button
                      onClick={() => handleActionClick(action)}
                      disabled={isDisabled || loadingAction !== null}
                      title={disabledReason || action.label}
                      aria-label={action.label}
                      className={`
                        flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors [&>svg]:size-4 focus-visible:outline-2 focus-visible:outline-blue-500
                        ${isDisabled || isLoading ? 'opacity-50 cursor-not-allowed' : ''}
                        ${isSliderOpen ? 'bg-neutral-200 dark:bg-neutral-700' : ''}
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
                      {isLoading ? <RefreshCw size={12} className="animate-spin" /> : action.icon}
                    </button>
                    {/* Inline slider popover */}
                    {isSliderOpen && (
                      <div
                        ref={sliderPopoverRef}
                        className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded shadow-lg px-2 py-1.5"
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min={action.input?.min ?? 0}
                            max={action.input?.max ?? 10}
                            value={(inputValues.value as number) ?? 0}
                            onChange={(e) =>
                              setInputValues({ value: parseInt(e.target.value, 10) })
                            }
                            className="w-24 h-1 bg-neutral-200 dark:bg-neutral-700 rounded-full appearance-none cursor-pointer accent-blue-500"
                          />
                          <span className="text-xs font-medium text-neutral-900 dark:text-neutral-100 w-4 text-center tabular-nums">
                            {(inputValues.value as number) ?? 0}
                          </span>
                          <button
                            onClick={() => executeAction(action, inputValues)}
                            disabled={isLoading}
                            className="p-0.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors"
                            title="Apply"
                          >
                            <Check size={14} />
                          </button>
                          <button
                            onClick={() => {
                              setInputAction(null);
                              setInputValues({});
                            }}
                            className="p-0.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded transition-colors"
                            title="Close"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </>
      }
    >
      {/* Action Error */}
      {actionError && (
        <div className="shrink-0 mx-4 mt-2 p-2 bg-red-500/10 border border-red-500/30 rounded text-red-600 dark:text-red-400 text-xs">
          {actionError}
        </div>
      )}
      {/* Action Confirmation Dialog */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg p-4 max-w-md mx-4 shadow-xl">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-200 mb-2">
              {confirmAction.confirm?.title}
            </h3>
            <p className="text-xs text-neutral-600 dark:text-neutral-400 mb-4">
              {confirmAction.confirm?.message}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmAction(null)}
                className="px-3 py-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => executeAction(confirmAction)}
                disabled={loadingAction === confirmAction.id}
                className={`
                  px-3 py-1.5 text-xs font-medium text-white rounded transition-colors
                  ${
                    confirmAction.variant === 'danger'
                      ? 'bg-red-600 hover:bg-red-700'
                      : confirmAction.variant === 'warning'
                        ? 'bg-amber-600 hover:bg-amber-700'
                        : 'bg-blue-600 hover:bg-blue-700'
                  }
                  ${loadingAction === confirmAction.id ? 'opacity-50 cursor-not-allowed' : ''}
                `}
              >
                {loadingAction === confirmAction.id ? (
                  <RefreshCw size={12} className="animate-spin inline mr-1" />
                ) : null}
                {confirmAction.confirm?.confirmLabel || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Action Input Dialog - only for non-slider types */}
      {inputAction && inputAction.input?.type !== 'slider' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg p-4 max-w-md mx-4 shadow-xl">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-200 mb-2">
              {inputAction.input?.title}
            </h3>
            {inputAction.input?.description && (
              <p className="text-xs text-neutral-600 dark:text-neutral-400 mb-4">
                {inputAction.input.description}
              </p>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                // An empty number field must not coerce to 0 (e.g. silently
                // scaling a workload to zero) — block submit instead.
                if (inputAction.input?.type === 'number' && typeof inputValues.value !== 'number')
                  return;
                executeAction(inputAction, inputValues);
              }}
              className="space-y-3"
            >
              <div>
                <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1">
                  {inputAction.input?.label}
                </label>
                <input
                  type={inputAction.input?.type}
                  value={inputValues.value ?? ''}
                  onChange={(e) => {
                    let value: string | number = e.target.value;
                    if (inputAction.input?.type === 'number') {
                      const parsed = parseInt(e.target.value, 10);
                      value = Number.isNaN(parsed) ? '' : parsed;
                    }
                    setInputValues({ value });
                  }}
                  min={inputAction.input?.min}
                  max={inputAction.input?.max}
                  placeholder={inputAction.input?.placeholder}
                  className="w-full px-3 py-2 text-sm bg-neutral-100 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-600 rounded text-neutral-900 dark:text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-blue-500"
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setInputAction(null);
                    setInputValues({});
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loadingAction === inputAction.id}
                  className={`
                    px-3 py-1.5 text-xs font-medium text-white rounded transition-colors
                    ${
                      inputAction.variant === 'danger'
                        ? 'bg-red-600 hover:bg-red-700'
                        : inputAction.variant === 'warning'
                          ? 'bg-amber-600 hover:bg-amber-700'
                          : 'bg-blue-600 hover:bg-blue-700'
                    }
                    ${loadingAction === inputAction.id ? 'opacity-50 cursor-not-allowed' : ''}
                  `}
                >
                  {loadingAction === inputAction.id ? (
                    <RefreshCw size={12} className="animate-spin inline mr-1" />
                  ) : null}
                  {inputAction.input?.submitLabel || 'Submit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {error && activeTab !== 'yaml' && (
        <div
          role="alert"
          className="shrink-0 border-b border-amber-200 bg-amber-50 px-5 py-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300"
        >
          <p className="break-words">
            {fullObject ? 'Could not refresh resource. Showing the last loaded data. ' : ''}
            {error}
          </p>
          <button
            type="button"
            onClick={() => void refetchResource()}
            className="mt-1 font-medium underline"
          >
            Retry
          </button>
        </div>
      )}
      {/* Content */}
      {loading && ['metadata', 'logs', 'terminal'].includes(activeTab) && (
        <div role="status" className="flex items-center gap-2 p-5 text-sm text-neutral-500">
          <Loader2 size={14} className="animate-spin" />
          Loading resource...
        </div>
      )}
      {activeTab === 'overview' && hasCustomAdapter && (
        <div className="@container min-h-0 flex-1 overflow-auto p-5">
          {loading && (
            <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400 text-sm mb-4">
              <Loader2 size={14} className="animate-spin" />
              Loading full resource...
            </div>
          )}

          {fullObject && !loading && (
            <ResourceVisualizer context={context} resource={fullObject} hideActions />
          )}
        </div>
      )}
      {activeTab === 'yaml' && (
        <div className="min-h-0 flex-1 overflow-hidden flex flex-col">
          <ManifestEditor
            resource={fullObject ?? null}
            loading={loading}
            error={error}
            onSave={handleSaveResource}
            toolbarRef={toolbarRef}
          />
        </div>
      )}
      {activeTab === 'metadata' && (
        <div className="min-h-0 flex-1 overflow-auto p-5">
          {displayObject && (
            <MetadataView metadata={displayObject.metadata as Record<string, unknown>} />
          )}
        </div>
      )}
      {activeTab === 'events' && (
        <div className="min-h-0 flex-1 overflow-auto p-5">
          <EventsView
            events={events}
            loading={eventsLoading}
            error={eventsError}
            onRetry={() => void refetchEvents()}
          />
        </div>
      )}
      {activeTab === 'logs' && supportsLogs && fullObject && (
        <div className="min-h-0 flex-1 overflow-hidden">
          <KubernetesLogViewer context={context} resource={fullObject} toolbarRef={toolbarRef} />
        </div>
      )}
      {activeTab === 'terminal' && supportsTerminal && fullObject && (
        <div className="min-h-0 flex-1 overflow-hidden">
          <TerminalViewer context={context} resource={fullObject} toolbarRef={toolbarRef} />
        </div>
      )}
    </DetailPanel>
  );
}
