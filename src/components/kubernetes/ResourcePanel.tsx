import { X, Loader2, RefreshCw, Check } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import type { V1ObjectReference } from '@kubernetes/client-node';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { getResource, getResourceEvents, updateResource, type KubernetesResource } from '../../api/kubernetes/kubernetes';
import { getResourceConfigByKind } from '../../api/kubernetes/kubernetesDiscovery';
import { ResourceVisualizer } from './ResourceVisualizer';
import { hasAdapter, getResourceActions } from './index';
import type { ResourceAction } from './adapters/types';
import { KubernetesLogViewer } from './LogViewer';
import { TerminalViewer } from './TerminalViewer';
import { MetadataView } from '../sections';
import { EventsView } from './EventsView';
import { ManifestEditor } from './ManifestEditor';

type TabType = 'overview' | 'metadata' | 'yaml' | 'events' | 'logs' | 'terminal';

interface ResourcePanelProps {
  context: string;
  isOpen: boolean;
  onClose: () => void;
  otherPanelOpen?: boolean;
  resource: V1ObjectReference | null;
  tab?: TabType;
  onTabChange?: (tab: TabType | undefined) => void;
}

// Metadata fields to hide from the detail panel
const HIDDEN_METADATA_FIELDS = new Set([
  'managedFields',
]);

// Filter hidden fields from metadata for display
function filterHiddenMetadataFields(obj: KubernetesResource): KubernetesResource {
  const meta = obj.metadata;
  if (!meta) return obj;
  
  const filteredMeta = Object.fromEntries(
    Object.entries(meta).filter(([key]) => !HIDDEN_METADATA_FIELDS.has(key))
  );
  
  return {
    ...obj,
    metadata: filteredMeta,
  };
}

export function ResourcePanel({ context, isOpen, onClose, otherPanelOpen = false, resource: resourceId, tab: urlTab, onTabChange }: ResourcePanelProps) {
  const [activeTab, setActiveTabState] = useState<TabType>('yaml');
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ResourceAction | null>(null);
  const [inputAction, setInputAction] = useState<ResourceAction | null>(null);
  const [inputValues, setInputValues] = useState<Record<string, string | number>>({});
  const resourceConfigRef = useRef<Awaited<ReturnType<typeof getResourceConfigByKind>> | null>(null);
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
    refetch: refetchResource
  } = useQuery({
    queryKey: ['kubernetes', 'resource', context, resourceId?.kind, resourceId?.apiVersion, resourceId?.name, resourceId?.namespace],
    queryFn: async () => {
      if (!resourceId || !resourceId.name || !resourceId.kind) return null;
      const config = await getResourceConfigByKind(context, resourceId.kind, resourceId.apiVersion);
      if (!config) throw new Error(`Unknown resource kind: ${resourceId.kind}`);
      resourceConfigRef.current = config;
      return getResource(context, config, resourceId.name, resourceId.namespace);
    },
    enabled: isOpen && !!resourceId?.name && !!resourceId?.kind,
    placeholderData: keepPreviousData,
  });

  // Fetch events using React Query
  const { 
    data: events = [], 
    isLoading: eventsLoading 
  } = useQuery({
    queryKey: ['kubernetes', 'events', context, resourceId?.name, resourceId?.namespace],
    queryFn: async () => {
      if (!resourceId?.name) return [];
      return getResourceEvents(context, resourceId.name, resourceId.namespace);
    },
    enabled: isOpen && !!resourceId?.name,
    placeholderData: keepPreviousData,
  });

  const error = resourceError instanceof Error ? resourceError.message : resourceError ? String(resourceError) : null;

  // Get actions for the current resource
  const resourceActions = fullObject ? getResourceActions(fullObject) : [];

  const executeAction = async (action: ResourceAction, values?: Record<string, string | number>) => {
    setActionError(null);
    setLoadingAction(action.id);
    try {
      await action.execute(context, fullObject!, values);
      refetchResource(); // Refresh after action
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
        : action.input.type === 'text' ? '' : 0;
      setInputValues({ value: defaultValue });
      setInputAction(action);
    } else if (action.confirm) {
      setConfirmAction(action);
    } else {
      executeAction(action);
    }
  };

  const handleSaveResource = useCallback(async (updatedResource: KubernetesResource) => {
    if (!resourceId || !resourceId.name || !resourceConfigRef.current) {
      throw new Error('Resource configuration not available');
    }

    await updateResource(
      context,
      resourceConfigRef.current,
      resourceId.name,
      updatedResource,
      resourceId.namespace
    );
    
    // Refetch to get the updated resource from the server
    refetchResource();
  }, [context, resourceId, refetchResource]);

  // Wrapper to update both local state and URL
  const setActiveTab = useCallback((tab: TabType) => {
    setActiveTabState(tab);
    onTabChange?.(tab);
  }, [onTabChange]);

  // Determine which tabs are available for the current resource (static checks)
  const kind = resourceId?.kind || '';
  const hasCustomAdapter = hasAdapter(kind);
  const LOGGABLE_KINDS = ['Pod', 'Deployment', 'DaemonSet', 'ReplicaSet', 'StatefulSet', 'Job'];
  const supportsLogs = LOGGABLE_KINDS.includes(kind) && !!resourceId?.namespace;
  const supportsTerminal = kind === 'Pod' && !!resourceId?.namespace;

  // Compute hasMetadata early (needed for tab validation)
  const hiddenLabels = new Set(['pod-template-hash', 'controller-revision-hash', 'pod-template-generation']);
  const hiddenAnnotations = new Set([
    'kubectl.kubernetes.io/last-applied-configuration',
    'deployment.kubernetes.io/revision',
    'control-plane.alpha.kubernetes.io/leader',
    'deprecated.daemonset.template.generation',
    'kubernetes.io/description',
  ]);
  const rawMetadata = fullObject?.metadata as Record<string, unknown> | undefined;
  const rawLabels = rawMetadata?.labels as Record<string, string> | undefined;
  const rawAnnotations = rawMetadata?.annotations as Record<string, string> | undefined;
  const filteredLabelsCount = rawLabels 
    ? Object.keys(rawLabels).filter(key => !hiddenLabels.has(key)).length 
    : 0;
  const filteredAnnotationsCount = rawAnnotations 
    ? Object.keys(rawAnnotations).filter(key => !hiddenAnnotations.has(key)).length 
    : 0;
  const hasMetadata = filteredLabelsCount > 0 || filteredAnnotationsCount > 0;
  const hasEvents = events.length > 0;

  // Helper to check if a tab is available
  const isTabAvailable = useCallback((tab: TabType): boolean => {
    switch (tab) {
      case 'overview': return hasCustomAdapter;
      case 'metadata': return hasMetadata;
      case 'yaml': return true;
      case 'events': return hasEvents;
      case 'logs': return supportsLogs;
      case 'terminal': return supportsTerminal;
      default: return false;
    }
  }, [hasCustomAdapter, hasMetadata, hasEvents, supportsLogs, supportsTerminal]);

  // Determine default tab
  const getDefaultTab = useCallback((): TabType => {
    return hasCustomAdapter ? 'overview' : 'yaml';
  }, [hasCustomAdapter]);

  // Sync tab from URL or set default when resource changes
  useEffect(() => {
    if (urlTab && isTabAvailable(urlTab)) {
      // URL tab is valid, use it
      setActiveTabState(urlTab);
    } else if (urlTab) {
      // URL tab is not available, fall back and update URL
      const fallback = getDefaultTab();
      setActiveTabState(fallback);
      onTabChange?.(fallback);
    } else {
      // No URL tab, use default
      setActiveTabState(getDefaultTab());
    }
  }, [resourceId?.kind, resourceId?.name, resourceId?.namespace, urlTab, isTabAvailable, getDefaultTab, onTabChange]);

  // Re-validate active tab when data changes (e.g., events load, metadata changes)
  useEffect(() => {
    if (!isTabAvailable(activeTab)) {
      const fallback = getDefaultTab();
      setActiveTabState(fallback);
      onTabChange?.(fallback);
    }
  }, [activeTab, isTabAvailable, getDefaultTab, onTabChange]);

  if (!isOpen || !resourceId || !resourceId.name) return null;

  const rawObject = fullObject;
  
  // Filter out hidden metadata fields for display
  const displayObject = rawObject ? filterHiddenMetadataFields(rawObject) : null;
  const resourceName = resourceId.name;

  return (
    <aside 
      className="fixed top-0 h-screen bg-white border-l border-neutral-200 dark:bg-neutral-900 dark:border-neutral-800 flex flex-col z-20 shadow-xl transition-all duration-300"
      style={{
        right: otherPanelOpen ? '28rem' : '0',
        width: otherPanelOpen ? '28rem' : '40rem',
      }}
    >      {/* Header */}
      <header className="shrink-0 h-16 flex items-center justify-between pl-5 pr-4 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 truncate">
              {resourceName}
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-500">{resourceId.namespace || 'cluster-scoped'}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:text-neutral-200 dark:hover:bg-neutral-800 rounded-md transition-colors"
          title="Close"
        >
          <X size={18} />
        </button>
      </header>

      {/* Tab Bar */}
      <div className="shrink-0 flex items-center border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50">
        <div className="flex">
          {hasCustomAdapter && (
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === 'overview'
                  ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400 -mb-px'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
              }`}
            >
              Overview
            </button>
          )}
          {hasMetadata && (
            <button
              onClick={() => setActiveTab('metadata')}
              className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === 'metadata'
                  ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400 -mb-px'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
              }`}
            >
              Metadata
            </button>
          )}
          <button
            onClick={() => setActiveTab('yaml')}
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'yaml'
                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400 -mb-px'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
            }`}
          >
            Manifest
          </button>
          {events.length > 0 && (
            <button
              onClick={() => setActiveTab('events')}
              className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === 'events'
                  ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400 -mb-px'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
              }`}
            >
              Events
            </button>
          )}
          {supportsLogs && (
            <button
              onClick={() => setActiveTab('logs')}
              className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === 'logs'
                  ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400 -mb-px'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
              }`}
            >
              Logs
            </button>
          )}
          {supportsTerminal && (
            <button
              onClick={() => setActiveTab('terminal')}
              className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === 'terminal'
                  ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400 -mb-px'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
              }`}
            >
              Terminal
            </button>
          )}
        </div>
        {/* Tab-specific action buttons - portal target for child components + overview actions */}
        <div className="ml-auto pr-4 flex items-center gap-1">
          {/* Portal target for child component toolbar actions */}
          <div ref={toolbarRef} className="flex items-center gap-1" />
          {activeTab === 'overview' && resourceActions.length > 0 && (
            <>
              {resourceActions.map(action => {
                const disabled = action.isDisabled?.(fullObject!);
                const isDisabled = disabled === true || typeof disabled === 'string';
                const disabledReason = typeof disabled === 'string' ? disabled : undefined;
                const isLoading = loadingAction === action.id;
                const isSliderOpen = inputAction?.id === action.id && action.input?.type === 'slider';

                return (
                  <div key={action.id} className="relative">
                    <button
                      onClick={() => handleActionClick(action)}
                      disabled={isDisabled || isLoading}
                      title={disabledReason || action.label}
                      className={`
                        flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded transition-colors
                        ${isDisabled || isLoading ? 'opacity-50 cursor-not-allowed' : ''}
                        ${isSliderOpen ? 'bg-neutral-200 dark:bg-neutral-700' : ''}
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
                        <RefreshCw size={12} className="animate-spin" />
                      ) : (
                        action.icon
                      )}
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
                            value={inputValues.value as number ?? 0}
                            onChange={(e) => setInputValues({ value: parseInt(e.target.value, 10) })}
                            className="w-24 h-1 bg-neutral-200 dark:bg-neutral-700 rounded-full appearance-none cursor-pointer accent-blue-500"
                          />
                          <span className="text-xs font-medium text-neutral-900 dark:text-neutral-100 w-4 text-center tabular-nums">
                            {inputValues.value as number ?? 0}
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
                            onClick={() => { setInputAction(null); setInputValues({}); }}
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
        </div>
      </div>

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
                  ${confirmAction.variant === 'danger' 
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
                    const value = inputAction.input?.type === 'number' 
                      ? parseInt(e.target.value, 10) || 0
                      : e.target.value;
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
                    ${inputAction.variant === 'danger' 
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

      {/* Content */}
      {activeTab === 'overview' && hasCustomAdapter && (
        <div className="flex-1 overflow-auto p-4">
          {loading && (
            <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400 text-sm mb-4">
              <Loader2 size={14} className="animate-spin" />
              Loading full resource...
            </div>
          )}
          {error && (
            <div className="text-xs text-red-600 dark:text-red-400 mb-4">{error}</div>
          )}

          {fullObject && !loading && (
            <ResourceVisualizer context={context} resource={fullObject} hideActions />
          )}
        </div>
      )}

      {activeTab === 'yaml' && (
        <div className="flex-1 overflow-hidden flex flex-col">
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
        <div className="flex-1 overflow-auto p-5">
          {displayObject && (
            <MetadataView metadata={displayObject.metadata as Record<string, unknown>} />
          )}
        </div>
      )}

      {activeTab === 'events' && (
        <div className="flex-1 overflow-auto p-5">
          <EventsView events={events} loading={eventsLoading} />
        </div>
      )}

      {activeTab === 'logs' && supportsLogs && fullObject && (
        <div className="flex-1 overflow-hidden">
          <KubernetesLogViewer
            context={context}
            resource={fullObject}
            toolbarRef={toolbarRef}
          />
        </div>
      )}

      {activeTab === 'terminal' && supportsTerminal && fullObject && (
        <div className="flex-1 overflow-hidden">
          <TerminalViewer
            context={context}
            resource={fullObject}
            toolbarRef={toolbarRef}
          />
        </div>
      )}
    </aside>
  );
}