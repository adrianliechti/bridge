import { X, Loader2, RefreshCw } from 'lucide-react';
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

interface ResourcePanelProps {
  context: string;
  isOpen: boolean;
  onClose: () => void;
  otherPanelOpen?: boolean;
  resource: V1ObjectReference | null;
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

export function ResourcePanel({ context, isOpen, onClose, otherPanelOpen = false, resource: resourceId }: ResourcePanelProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'metadata' | 'yaml' | 'events' | 'logs' | 'terminal'>('yaml');
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ResourceAction | null>(null);
  const resourceConfigRef = useRef<Awaited<ReturnType<typeof getResourceConfigByKind>> | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

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

  const executeAction = async (action: ResourceAction) => {
    setActionError(null);
    setLoadingAction(action.id);
    try {
      await action.execute(context, fullObject!);
      refetchResource(); // Refresh after action
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setLoadingAction(null);
      setConfirmAction(null);
    }
  };

  const handleActionClick = (action: ResourceAction) => {
    if (action.confirm) {
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

  // Reset tab when resource changes - use overview if adapter exists, otherwise yaml
  useEffect(() => {
    const kind = resourceId?.kind || '';
    setActiveTab(hasAdapter(kind) ? 'overview' : 'yaml');
  }, [resourceId?.kind, resourceId?.name, resourceId?.namespace]);

  if (!isOpen || !resourceId || !resourceId.name) return null;

  const rawObject = fullObject;
  
  // Filter out hidden metadata fields for display
  const displayObject = rawObject ? filterHiddenMetadataFields(rawObject) : null;
  const resourceName = resourceId.name;
  const resourceKind = resourceId.kind || 'Resource';

  // Check if resource has a custom adapter for Overview tab
  const hasCustomAdapter = hasAdapter(resourceKind);

  // Check if metadata has labels or annotations to show
  const hiddenLabels = new Set(['pod-template-hash', 'controller-revision-hash', 'pod-template-generation']);
  const hiddenAnnotations = new Set([
    'kubectl.kubernetes.io/last-applied-configuration',
    'deployment.kubernetes.io/revision',
    'control-plane.alpha.kubernetes.io/leader',
    'deprecated.daemonset.template.generation',
    'kubernetes.io/description',
  ]);
  
  const metadata = displayObject?.metadata as Record<string, unknown> | undefined;
  const labels = metadata?.labels as Record<string, string> | undefined;
  const annotations = metadata?.annotations as Record<string, string> | undefined;
  
  const filteredLabelsCount = labels 
    ? Object.keys(labels).filter(key => !hiddenLabels.has(key)).length 
    : 0;
  const filteredAnnotationsCount = annotations 
    ? Object.keys(annotations).filter(key => !hiddenAnnotations.has(key)).length 
    : 0;
  const hasMetadata = filteredLabelsCount > 0 || filteredAnnotationsCount > 0;

  // Resource kinds that support logs (have pods)
  const LOGGABLE_KINDS = ['Pod', 'Deployment', 'DaemonSet', 'ReplicaSet', 'StatefulSet', 'Job'];
  const supportsLogs = LOGGABLE_KINDS.includes(resourceKind) && !!resourceId.namespace;
  
  // Only pods support terminal
  const supportsTerminal = resourceKind === 'Pod' && !!resourceId.namespace;

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
                      <RefreshCw size={12} className="animate-spin" />
                    ) : (
                      action.icon
                    )}
                  </button>
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