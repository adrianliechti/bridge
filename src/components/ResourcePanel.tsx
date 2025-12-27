import { X, Loader2, Copy, Check, Save, RotateCcw } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import type { V1ObjectReference } from '@kubernetes/client-node';
import { getResource, getResourceEvents, updateResource, type CoreV1Event, type KubernetesResource } from '../api/kubernetes';
import { getResourceConfigByKind } from '../api/kubernetesDiscovery';
import { ResourceVisualizer } from './ResourceVisualizer';
import { hasAdapter } from './adapters';
import { LogViewer } from './LogViewer';
import type { LogEntry } from '../api/kubernetesLogs';
import { MetadataView, EventsView, ManifestEditor, type ManifestEditorState } from './sections';

interface ResourcePanelProps {
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

export function ResourcePanel({ isOpen, onClose, otherPanelOpen = false, resource: resourceId }: ResourcePanelProps) {
  const [fullObject, setFullObject] = useState<KubernetesResource | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<CoreV1Event[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'metadata' | 'yaml' | 'events' | 'logs'>('yaml');
  const [copied, setCopied] = useState(false);
  const [manifestEditorState, setManifestEditorState] = useState<ManifestEditorState | null>(null);
  const getLogsRef = useRef<(() => LogEntry[]) | null>(null);
  const resourceConfigRef = useRef<Awaited<ReturnType<typeof getResourceConfigByKind>> | null>(null);

  // Auto-refresh interval (5 seconds)
  const REFRESH_INTERVAL = 5000;

  const fetchResourceData = useCallback(async () => {
    if (!resourceId || !resourceId.name || !resourceId.kind) return;
    
    try {
      const config = await getResourceConfigByKind(resourceId.kind, resourceId.apiVersion);
      if (config) {
        const resource = await getResource(config, resourceId.name, resourceId.namespace);
        setFullObject(resource);
      }
      // Also refresh events
      const resourceEvents = await getResourceEvents(resourceId.name, resourceId.namespace);
      setEvents(resourceEvents);
    } catch {
      // Silent fail for background refreshes
    }
  }, [resourceId]);

  // Auto-refresh polling
  useEffect(() => {
    if (!isOpen || !resourceId?.name || !fullObject) return;

    const interval = setInterval(() => {
      fetchResourceData();
    }, REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [isOpen, resourceId?.name, fullObject, fetchResourceData]);

  const handleCopyLogs = async () => {
    if (!getLogsRef.current) return;
    const logs = getLogsRef.current();
    const text = logs.map(log => `${log.timestamp} [${log.podName}] ${log.message}`).join('\n');
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveResource = useCallback(async (updatedResource: KubernetesResource) => {
    if (!resourceId || !resourceId.name || !resourceConfigRef.current) {
      throw new Error('Resource configuration not available');
    }

    const updated = await updateResource(
      resourceConfigRef.current,
      resourceId.name,
      updatedResource,
      resourceId.namespace
    );
    
    // Update the local state with the response from the server
    setFullObject(updated);
  }, [resourceId]);

  // Fetch the resource config and full resource when resourceId changes
  useEffect(() => {
    // Reset tab when resource changes - use overview if adapter exists, otherwise yaml
    const kind = resourceId?.kind || '';
    setActiveTab(hasAdapter(kind) ? 'overview' : 'yaml');
    
    if (!resourceId || !resourceId.name || !resourceId.kind) {
      setFullObject(null);
      setError(null);
      setEvents([]);
      return;
    }

    const name = resourceId.name;
    const ns = resourceId.namespace;
    const apiVersion = resourceId.apiVersion;

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // Get the resource config by kind using discovery API
        const config = await getResourceConfigByKind(kind, apiVersion);
        if (!config) {
          setError(`Unknown resource kind: ${kind}`);
          setLoading(false);
          return;
        }

        // Store the config for later use (e.g., updates)
        resourceConfigRef.current = config;

        // Then fetch the full resource
        const resource = await getResource(config, name, ns);
        setFullObject(resource);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch resource');
        setFullObject(null);
      } finally {
        setLoading(false);
      }
    };

    const fetchEvents = async () => {
      setEventsLoading(true);
      try {
        const resourceEvents = await getResourceEvents(name, ns);
        setEvents(resourceEvents);
      } catch (err) {
        console.error('Failed to fetch events:', err);
        setEvents([]);
      } finally {
        setEventsLoading(false);
      }
    };

    fetchData();
    fetchEvents();
  }, [resourceId]);

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
  const LOGGABLE_KINDS = ['Pod', 'Deployment', 'DaemonSet', 'ReplicaSet', 'StatefulSet', 'Job', 'CronJob'];
  const supportsLogs = LOGGABLE_KINDS.includes(resourceKind) && !!resourceId.namespace;

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
        </div>
        {/* Tab-specific action buttons */}
        <div className="ml-auto pr-4 flex items-center gap-1">
          {activeTab === 'yaml' && manifestEditorState && (
            <>
              <button
                onClick={() => manifestEditorState?.reset()}
                disabled={!manifestEditorState.isDirty || manifestEditorState.isSaving}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Reset changes"
              >
                <RotateCcw size={12} />
              </button>
              <button
                onClick={() => manifestEditorState?.save()}
                disabled={!manifestEditorState.isDirty || manifestEditorState.hasError || manifestEditorState.isSaving}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
                title="Save changes"
              >
                {manifestEditorState.isSaving ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Save size={12} />
                )}
              </button>
            </>
          )}
          {activeTab === 'logs' && (
            <button
              onClick={handleCopyLogs}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded transition-colors"
              title="Copy logs"
            >
              {copied ? (
                <Check size={12} className="text-emerald-500" />
              ) : (
                <Copy size={12} />
              )}
            </button>
          )}
        </div>
      </div>

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
            <ResourceVisualizer resource={fullObject} namespace={resourceId.namespace} />
          )}
        </div>
      )}

      {activeTab === 'yaml' && (
        <div className="flex-1 overflow-hidden flex flex-col">
          <ManifestEditor
            resource={fullObject}
            loading={loading}
            error={error}
            onSave={handleSaveResource}
            onStateRef={setManifestEditorState}
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

      {activeTab === 'logs' && supportsLogs && (
        <div className="flex-1 overflow-hidden">
          <LogViewer
            namespace={resourceId.namespace!}
            workloadKind={resourceKind}
            workloadName={resourceName}
            onLogsRef={(getLogs) => { getLogsRef.current = getLogs; }}
          />
        </div>
      )}
    </aside>
  );
}