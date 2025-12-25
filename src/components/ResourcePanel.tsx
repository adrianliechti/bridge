import { X, ChevronDown, ChevronRight, Loader2, Copy, Check, ChevronsDownUp } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import type { V1ObjectReference } from '@kubernetes/client-node';
import { getResource, getResourceEvents, type CoreV1Event, type KubernetesResource } from '../api/kubernetes';
import { getResourceConfigByKind } from '../api/kubernetesDiscovery';
import { ResourceVisualizer } from './ResourceVisualizer';
import { hasAdapter } from './resources';
import { LogViewer } from './LogViewer';
import type { LogEntry } from '../api/kubernetesLogs';

interface ResourcePanelProps {
  isOpen: boolean;
  onClose: () => void;
  otherPanelOpen?: boolean;
  resource: V1ObjectReference | null;
}

// Format a value for display with syntax coloring
function ValueDisplay({ value }: { value: unknown }) {
  if (value === null) {
    return <span className="text-gray-500 italic">null</span>;
  }
  if (value === undefined) {
    return <span className="text-gray-500 italic">undefined</span>;
  }
  if (typeof value === 'boolean') {
    return <span className={value ? 'text-emerald-400' : 'text-red-400'}>{String(value)}</span>;
  }
  if (typeof value === 'number') {
    return <span className="text-amber-400">{value}</span>;
  }
  if (typeof value === 'string') {
    // Check if it looks like a date
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
      return <span className="text-purple-400">{value}</span>;
    }
    // Check if it's a URL or path
    if (value.startsWith('http') || value.startsWith('/')) {
      return <span className="text-cyan-400">{value}</span>;
    }
    return <span className="text-emerald-300">"{value}"</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="text-gray-500">[]</span>;
    }
    // For simple arrays of primitives, show inline
    if (value.every(v => typeof v !== 'object' || v === null)) {
      return (
        <span className="text-gray-300">
          [
          {value.map((v, i) => (
            <span key={i}>
              {i > 0 && <span className="text-gray-500">, </span>}
              <ValueDisplay value={v} />
            </span>
          ))}
          ]
        </span>
      );
    }
    // Complex arrays will be handled by ArrayTree
    return null;
  }
  // Fallback for other types
  return <span className="text-gray-300">{JSON.stringify(value)}</span>;
}

// Check if value is an object that can be expanded
function isExpandable(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Check if value is a complex array that needs tree rendering
function isExpandableArray(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.length > 0 && value.some(v => typeof v === 'object' && v !== null);
}

// Render array items
function ArrayTree({ data, depth = 0 }: { data: unknown[]; depth?: number }) {
  const [expanded, setExpanded] = useState<Set<number>>(() => {
    // Auto-expand first few items
    return new Set(data.slice(0, 3).map((_, i) => i));
  });

  const toggle = (index: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  return (
    <div className={depth > 0 ? 'ml-2 border-l border-gray-800 pl-2' : ''}>
      {data.map((value, index) => {
        const isObj = isExpandable(value);
        const isArr = isExpandableArray(value);
        const isOpen = expanded.has(index);

        return (
          <div key={index} className="py-1">
            <div className="flex items-start gap-1">
              {(isObj || isArr) ? (
                <button
                  onClick={() => toggle(index)}
                  className="mt-0.5 text-gray-500 hover:text-gray-300 transition-colors"
                >
                  {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
              ) : (
                <span className="w-3.5" />
              )}
              <span className="text-gray-500 text-sm">[{index}]</span>
              {!isObj && !isArr && (
                <span className="text-gray-300 text-sm ml-1 break-all">
                  <ValueDisplay value={value} />
                </span>
              )}
            </div>
            {isObj && isOpen && (
              <ObjectTree data={value as Record<string, unknown>} depth={depth + 1} />
            )}
            {isArr && isOpen && (
              <ArrayTree data={value as unknown[]} depth={depth + 1} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// Recursive component to render nested objects
function ObjectTree({ data, depth = 0 }: { data: Record<string, unknown>; depth?: number }) {
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    // Auto-expand first level
    if (depth === 0) {
      return new Set(Object.keys(data));
    }
    return new Set();
  });

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Sort keys alphabetically
  const sortedEntries = Object.entries(data).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className={depth > 0 ? 'ml-2 border-l border-gray-800 pl-2' : ''}>
      {sortedEntries.map(([key, value]) => {
        const isObj = isExpandable(value);
        const isArr = isExpandableArray(value);
        const isOpen = expanded.has(key);

        return (
          <div key={key} className="py-1">
            <div className="flex items-start gap-1">
              {(isObj || isArr) ? (
                <button
                  onClick={() => toggle(key)}
                  className="mt-0.5 text-gray-500 hover:text-gray-300 transition-colors"
                >
                  {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
              ) : (
                <span className="w-3.5" />
              )}
              <span className="text-sky-400 text-sm">{key}:</span>
              {!isObj && !isArr && (
                <span className="text-sm ml-1 break-all">
                  <ValueDisplay value={value} />
                </span>
              )}
            </div>
            {isObj && isOpen && (
              <ObjectTree data={value as Record<string, unknown>} depth={depth + 1} />
            )}
            {isArr && isOpen && (
              <ArrayTree data={value as unknown[]} depth={depth + 1} />
            )}
          </div>
        );
      })}
    </div>
  );
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
  const [activeTab, setActiveTab] = useState<'overview' | 'manifest' | 'events' | 'logs'>('overview');
  const [copied, setCopied] = useState(false);
  const [manifestExpandAll, setManifestExpandAll] = useState<boolean | null>(null);
  const getLogsRef = useRef<(() => LogEntry[]) | null>(null);

  const handleCopyManifest = async () => {
    if (!fullObject) return;
    const yaml = toYaml(fullObject);
    await navigator.clipboard.writeText(yaml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyLogs = async () => {
    if (!getLogsRef.current) return;
    const logs = getLogsRef.current();
    const text = logs.map(log => `${log.timestamp} [${log.podName}] ${log.message}`).join('\n');
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Fetch the resource config and full resource when resourceId changes
  useEffect(() => {
    // Reset to overview tab when resource changes
    setActiveTab('overview');
    
    if (!resourceId || !resourceId.name || !resourceId.kind) {
      setFullObject(null);
      setError(null);
      setEvents([]);
      return;
    }

    const name = resourceId.name;
    const ns = resourceId.namespace;
    const kind = resourceId.kind;
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

  // Resource kinds that support logs (have pods)
  const LOGGABLE_KINDS = ['Pod', 'Deployment', 'DaemonSet', 'ReplicaSet', 'StatefulSet', 'Job', 'CronJob'];
  const supportsLogs = LOGGABLE_KINDS.includes(resourceKind) && !!resourceId.namespace;

  return (
    <aside 
      className="fixed top-0 h-screen bg-white border-l border-gray-200 dark:bg-gray-900 dark:border-gray-800 flex flex-col z-20 shadow-xl transition-all duration-300"
      style={{
        right: otherPanelOpen ? '28rem' : '0',
        width: otherPanelOpen ? '28rem' : '40rem',
      }}
    >      {/* Header */}
      <header className="shrink-0 h-16 flex items-center justify-between pl-5 pr-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">
              {resourceName}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-500">{resourceId.namespace || 'cluster-scoped'}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-800 rounded-md transition-colors"
          title="Close"
        >
          <X size={18} />
        </button>
      </header>

      {/* Tab Bar */}
      <div className="shrink-0 flex items-center border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
        <div className="flex">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'overview'
                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400 -mb-px'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('manifest')}
          className={`px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === 'manifest'
              ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400 -mb-px'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
          }`}
        >
          Manifest
        </button>
        <button
          onClick={() => setActiveTab('events')}
          className={`px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === 'events'
              ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400 -mb-px'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
          }`}
        >
          Events{events.length > 0 ? ` (${events.length})` : ''}
        </button>
        {supportsLogs && (
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'logs'
                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400 -mb-px'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            Logs
          </button>
        )}
        </div>
        {/* Tab-specific action buttons */}
        <div className="ml-auto pr-4 flex items-center gap-1">
          {activeTab === 'manifest' && (
            <>
              <button
                onClick={() => setManifestExpandAll(prev => prev === false ? true : false)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800 rounded transition-colors"
                title={manifestExpandAll === false ? "Expand all" : "Collapse all"}
              >
                <ChevronsDownUp size={12} />
              </button>
              <button
                onClick={handleCopyManifest}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800 rounded transition-colors"
                title="Copy as YAML"
              >
                {copied ? (
                  <Check size={12} className="text-emerald-500" />
                ) : (
                  <Copy size={12} />
                )}
              </button>
            </>
          )}
          {activeTab === 'logs' && (
            <button
              onClick={handleCopyLogs}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800 rounded transition-colors"
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
      {activeTab === 'overview' && (
        <div className="flex-1 overflow-auto p-4">
          {loading && (
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 text-sm mb-4">
              <Loader2 size={14} className="animate-spin" />
              Loading full resource...
            </div>
          )}
          {error && (
            <div className="text-xs text-red-600 dark:text-red-400 mb-4">{error}</div>
          )}

          {displayObject && (
            <>
          {/* Specialized Resource Visualizer */}
          {(() => {
            if (hasAdapter(resourceKind) && fullObject && !loading) {
              return <ResourceVisualizer resource={fullObject} namespace={resourceId.namespace} />;
            }
            // Fallback metadata section for resources without adapters
            return <MetadataSection metadata={displayObject.metadata as Record<string, unknown>} />;
          })()}
            </>
          )}
        </div>
      )}

      {activeTab === 'manifest' && (
        <div className="flex-1 overflow-hidden flex flex-col">
          <ManifestView 
            key={`manifest-${manifestExpandAll}`}
            resource={fullObject} 
            loading={loading} 
            error={error}
            expandAll={manifestExpandAll}
          />
        </div>
      )}

      {activeTab === 'events' && (
        <div className="flex-1 overflow-auto p-5">
          <EventsTab events={events} loading={eventsLoading} />
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

// Manifest view component with interactive collapsible tree
function ManifestView({ 
  resource, 
  loading, 
  error,
  expandAll,
}: { 
  resource: KubernetesResource | null; 
  loading: boolean; 
  error: string | null;
  expandAll?: boolean | null;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 text-sm">
          <Loader2 size={14} className="animate-spin" />
          Loading manifest...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
      </div>
    );
  }

  if (!resource) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-sm text-gray-500 dark:text-gray-400">No resource loaded</div>
      </div>
    );
  }

  // Define the order of top-level keys
  const keyOrder = ['apiVersion', 'kind', 'metadata', 'spec', 'status', 'data', 'stringData', 'type'];
  const resourceKeys = Object.keys(resource);
  const orderedKeys = [
    ...keyOrder.filter(k => resourceKeys.includes(k)),
    ...resourceKeys.filter(k => !keyOrder.includes(k))
  ];

  return (
    <>
      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        <div className="space-y-1">
          {orderedKeys.map(key => {
            const value = (resource as Record<string, unknown>)[key];
            const defaultOpenKeys = ['metadata', 'spec', 'status'];
            const shouldBeOpen = expandAll !== null && expandAll !== undefined 
              ? expandAll 
              : defaultOpenKeys.includes(key);
            return (
              <ManifestSection 
                key={key} 
                label={key} 
                value={value}
                defaultOpen={shouldBeOpen}
              />
            );
          })}
        </div>
      </div>
    </>
  );
}

// Collapsible section for manifest top-level keys
function ManifestSection({ 
  label, 
  value, 
  defaultOpen = false 
}: { 
  label: string; 
  value: unknown; 
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const isExpandable = value !== null && typeof value === 'object';

  if (!isExpandable) {
    // Simple key-value display for primitives
    return (
      <div className="flex items-center gap-2 py-1 px-3">
        <span className="w-4" />
        <span className="text-purple-400 font-medium text-sm">{label}:</span>
        <span className="text-sm"><ValueDisplay value={value} /></span>
      </div>
    );
  }

  const isEmpty = Array.isArray(value) ? value.length === 0 : Object.keys(value as object).length === 0;

  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-800/50 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors text-left"
      >
        {isOpen ? (
          <ChevronDown size={14} className="text-gray-500 shrink-0" />
        ) : (
          <ChevronRight size={14} className="text-gray-500 shrink-0" />
        )}
        <span className="text-purple-400 font-medium text-sm">{label}</span>
        {isEmpty && (
          <span className="text-gray-500 text-xs">(empty)</span>
        )}
        {!isEmpty && !isOpen && (
          <span className="text-gray-500 text-xs">
            {Array.isArray(value) ? `[${value.length} items]` : `{${Object.keys(value as object).length} fields}`}
          </span>
        )}
      </button>
      {isOpen && !isEmpty && (
        <div className="px-3 py-2 bg-gray-50 dark:bg-gray-900/30">
          {Array.isArray(value) ? (
            <ArrayTree data={value} depth={0} />
          ) : (
            <ObjectTree data={value as Record<string, unknown>} depth={0} />
          )}
        </div>
      )}
    </div>
  );
}

// Simple YAML serializer for copy functionality
function toYaml(obj: unknown, indent = 0): string {
  const spaces = '  '.repeat(indent);
  
  if (obj === null) return 'null';
  if (obj === undefined) return '';
  if (typeof obj === 'boolean') return obj ? 'true' : 'false';
  if (typeof obj === 'number') return String(obj);
  if (typeof obj === 'string') {
    if (obj.includes('\n')) {
      const lines = obj.split('\n');
      return '|-\n' + lines.map(line => spaces + '  ' + line).join('\n');
    }
    if (obj === '' || obj.includes(':') || obj.includes('#') || obj.includes("'") || obj.includes('"') || /^\s|\s$/.test(obj)) {
      return JSON.stringify(obj);
    }
    return obj;
  }
  
  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';
    return obj.map(item => {
      const value = toYaml(item, indent + 1);
      if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
        const lines = value.split('\n');
        return spaces + '- ' + lines[0] + (lines.length > 1 ? '\n' + lines.slice(1).join('\n') : '');
      }
      return spaces + '- ' + value;
    }).join('\n');
  }
  
  if (typeof obj === 'object') {
    const entries = Object.entries(obj as Record<string, unknown>);
    if (entries.length === 0) return '{}';
    return entries.map(([key, value]) => {
      const yamlValue = toYaml(value, indent + 1);
      if (typeof value === 'object' && value !== null && (Array.isArray(value) ? value.length > 0 : Object.keys(value).length > 0)) {
        return spaces + key + ':\n' + yamlValue;
      }
      return spaces + key + ': ' + yamlValue;
    }).join('\n');
  }
  
  return String(obj);
}

// Metadata section with nice visualization of labels/annotations
function MetadataSection({ metadata }: { metadata: Record<string, unknown> }) {
  const labels = metadata.labels as Record<string, string> | undefined;
  const annotations = metadata.annotations as Record<string, string> | undefined;
  
  // Labels that are typically not useful for users (internal/auto-generated)
  const hiddenLabels = new Set<string>([
    'pod-template-hash',
    'controller-revision-hash',
    'pod-template-generation',
  ]);
  
  // Annotations that are too verbose or internal
  const hiddenAnnotations = new Set<string>([
    'kubectl.kubernetes.io/last-applied-configuration',
    'deployment.kubernetes.io/revision',
    'control-plane.alpha.kubernetes.io/leader',
  ]);
  
  const filteredLabels = labels 
    ? Object.fromEntries(
        Object.entries(labels).filter(([key]) => !hiddenLabels.has(key))
      )
    : undefined;
  
  const filteredAnnotations = annotations 
    ? Object.fromEntries(
        Object.entries(annotations).filter(([key]) => !hiddenAnnotations.has(key))
      )
    : undefined;

  return (
    <section className="mb-4">
      <h4 className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-2">
        Metadata
      </h4>
      
      <div className="bg-gray-100 dark:bg-gray-800/50 rounded-lg p-4 space-y-4">
        {/* Labels */}
        {filteredLabels && Object.keys(filteredLabels).length > 0 && (
          <div>
            <div className="text-xs text-gray-500 mb-2">Labels</div>
            <table className="w-full text-xs">
              <tbody>
                {Object.entries(filteredLabels).map(([key, value]) => (
                  <tr key={key} className="border-b border-gray-200 dark:border-gray-700/50 last:border-0">
                    <td className="py-1.5 pr-3 text-sky-600 dark:text-sky-400 align-top whitespace-nowrap">
                      {key}
                    </td>
                    <td className="py-1.5 text-emerald-600 dark:text-emerald-400 break-all">
                      {value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Annotations */}
        {filteredAnnotations && Object.keys(filteredAnnotations).length > 0 && (
          <div>
            <div className="text-xs text-gray-500 mb-2">Annotations</div>
            <table className="w-full text-xs">
              <tbody>
                {Object.entries(filteredAnnotations).map(([key, value]) => (
                  <tr key={key} className="border-b border-gray-200 dark:border-gray-700/50 last:border-0">
                    <td className="py-1.5 pr-3 text-purple-600 dark:text-purple-400 align-top whitespace-nowrap">
                      {key}
                    </td>
                    <td className="py-1.5 text-gray-600 dark:text-gray-300 break-all">
                      {value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

// Events tab component (full page, no collapse)
function EventsTab({ events, loading }: { events: CoreV1Event[]; loading: boolean }) {
  if (loading && events.length === 0) {
    return (
      <div className="flex items-center gap-2 text-gray-500 text-sm">
        <Loader2 size={14} className="animate-spin" />
        Loading events...
      </div>
    );
  }
  
  if (events.length === 0) {
    return (
      <div className="text-gray-500 text-sm italic">No events found for this resource</div>
    );
  }

  // Group events by type
  const warnings = events.filter(e => e.type === 'Warning');
  const normal = events.filter(e => e.type !== 'Warning');

  return (
    <div className="space-y-4">
      {warnings.length > 0 && (
        <div>
          <h5 className="text-xs font-medium text-amber-400 uppercase tracking-wider mb-2 flex items-center gap-2">
            Warnings ({warnings.length})
          </h5>
          <div className="space-y-2">
            {warnings.map((event) => (
              <EventItem key={event.metadata?.uid || `${event.reason}-${event.lastTimestamp}`} event={event} />
            ))}
          </div>
        </div>
      )}
      
      {normal.length > 0 && (
        <div>
          <h5 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
            Normal Events ({normal.length})
          </h5>
          <div className="space-y-2">
            {normal.map((event) => (
              <EventItem key={event.metadata?.uid || `${event.reason}-${event.lastTimestamp}`} event={event} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Single event item
function EventItem({ event }: { event: CoreV1Event }) {
  // CoreV1Event uses Date objects, so we need to convert appropriately
  const getTimestamp = (): string => {
    if (event.lastTimestamp) {
      return event.lastTimestamp instanceof Date 
        ? event.lastTimestamp.toISOString() 
        : String(event.lastTimestamp);
    }
    if (event.eventTime) {
      return String(event.eventTime);
    }
    if (event.metadata?.creationTimestamp) {
      return event.metadata.creationTimestamp instanceof Date
        ? event.metadata.creationTimestamp.toISOString()
        : String(event.metadata.creationTimestamp);
    }
    return new Date().toISOString();
  };
  
  const timestamp = getTimestamp();
  const isWarning = event.type === 'Warning';
  
  return (
    <div className={`p-3 rounded-lg border ${
      isWarning 
        ? 'bg-amber-500/5 border-amber-500/20' 
        : 'bg-gray-900/50 border-gray-700/50'
    }`}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-2">
          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
            isWarning 
              ? 'bg-amber-500/20 text-amber-400' 
              : 'bg-emerald-500/20 text-emerald-400'
          }`}>
            {event.type}
          </span>
          <span className="text-sm font-medium text-gray-200">{event.reason}</span>
        </div>
        <span className="text-xs text-gray-500 whitespace-nowrap">
          {formatEventTime(timestamp)}
        </span>
      </div>
      <p className="text-sm text-gray-400">{event.message}</p>
      {event.count && event.count > 1 && (
        <p className="text-xs text-gray-500 mt-1">
          Occurred {event.count} times
        </p>
      )}
    </div>
  );
}

// Format event timestamp
function formatEventTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return `${seconds}s ago`;
}
