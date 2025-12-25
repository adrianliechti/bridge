import { X, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import type { V1ObjectReference } from '@kubernetes/client-node';
import { getResource, getResourceEvents, type CoreV1Event, type KubernetesResource } from '../api/kubernetes';
import { getResourceConfigByKind } from '../api/kubernetesDiscovery';
import { getVisualizer } from './visualizer/Visualizer';

// Import visualizers to register them
import './visualizer/Pod';
import './visualizer/Deployment';
import './visualizer/DaemonSet';
import './visualizer/StatefulSet';
import './visualizer/ReplicaSet';
import './visualizer/PersistentVolume';
import './visualizer/PersistentVolumeClaim';
import './visualizer/Node';
import './visualizer/Job';
import './visualizer/CronJob';

interface DetailPanelProps {
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

export function DetailPanel({ isOpen, onClose, otherPanelOpen = false, resource: resourceId }: DetailPanelProps) {
  const [fullObject, setFullObject] = useState<KubernetesResource | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<CoreV1Event[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  // Fetch the resource config and full resource when resourceId changes
  useEffect(() => {
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

  return (
    <aside 
      className="fixed top-0 h-screen bg-white border-l border-gray-200 dark:bg-gray-900 dark:border-gray-800 flex flex-col z-20 shadow-xl transition-all duration-300"
      style={{
        right: otherPanelOpen ? '28rem' : '0',
        width: otherPanelOpen ? '28rem' : '40rem',
      }}
    >      {/* Header */}
      <header className="shrink-0 h-16 flex items-center justify-between px-5 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">
              {resourceName}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-500">{resourceKind}</p>
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

      {/* Content */}
      <div className="flex-1 overflow-auto p-5">
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
          const Visualizer = getVisualizer(resourceKind);
          if (Visualizer && fullObject && !loading) {
            return (
              <CollapsibleSection title="Overview" defaultOpen>
                <Visualizer resource={fullObject} namespace={resourceId.namespace} />
              </CollapsibleSection>
            );
          }
          return null;
        })()}

        {/* Metadata Section */}
        <MetadataSection metadata={displayObject.metadata as Record<string, unknown>} />

        {/* Spec Section */}
        {typeof displayObject.spec === 'object' && displayObject.spec !== null ? (
          <CollapsibleSection title="Spec" defaultOpen>
            <ObjectTree data={displayObject.spec as Record<string, unknown>} />
          </CollapsibleSection>
        ) : null}

        {/* Status Section */}
        {typeof displayObject.status === 'object' && displayObject.status !== null ? (
          <CollapsibleSection title="Status" defaultOpen>
            <ObjectTree data={displayObject.status as Record<string, unknown>} />
          </CollapsibleSection>
        ) : null}
          </>
        )}

        {/* Events Section */}
        <EventsSection events={events} loading={eventsLoading} />
      </div>
    </aside>
  );
}

// Metadata section with nice visualization of labels/annotations
function MetadataSection({ metadata }: { metadata: Record<string, unknown> }) {
  const [showRaw, setShowRaw] = useState(false);
  
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
  
  // Key metadata fields to show at top
  const name = metadata.name as string;
  const namespace = metadata.namespace as string | undefined;
  const creationTimestamp = metadata.creationTimestamp as string;

  return (
    <section className="mb-4">
      <button
        onClick={() => setShowRaw(!showRaw)}
        className="w-full flex items-center gap-2 text-left py-2 hover:bg-gray-100 dark:hover:bg-gray-800/30 rounded transition-colors"
      >
        {showRaw ? (
          <ChevronDown size={16} className="text-gray-500" />
        ) : (
          <ChevronRight size={16} className="text-gray-500" />
        )}
        <h4 className="text-xs font-medium uppercase tracking-wider text-gray-400">
          Metadata
        </h4>
      </button>
      
      <div className="bg-gray-100 dark:bg-gray-800/50 rounded-lg p-4 mt-2 space-y-4">
        {/* Key Fields Table */}
        <div>
          <h5 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Info</h5>
          <table className="w-full text-sm">
            <tbody>
              <MetadataRow label="Name" value={name} />
              {namespace && <MetadataRow label="Namespace" value={namespace} />}
              <MetadataRow label="Created" value={formatTimestamp(creationTimestamp)} />
            </tbody>
          </table>
        </div>

        {/* Labels */}
        {filteredLabels && Object.keys(filteredLabels).length > 0 && (
          <div>
            <h5 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
              Labels ({Object.keys(filteredLabels).length})
            </h5>
            <table className="w-full text-sm">
              <tbody>
                {Object.entries(filteredLabels).map(([key, value]) => (
                  <tr key={key} className="border-b border-gray-700/50 last:border-0">
                    <td className="py-1.5 pr-3 text-sky-400 align-top whitespace-nowrap text-xs">
                      {key}
                    </td>
                    <td className="py-1.5 text-emerald-300 break-all text-xs">
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
            <h5 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
              Annotations ({Object.keys(filteredAnnotations).length})
            </h5>
            <table className="w-full text-sm">
              <tbody>
                {Object.entries(filteredAnnotations).map(([key, value]) => (
                  <tr key={key} className="border-b border-gray-700/50 last:border-0">
                    <td className="py-1.5 pr-3 text-purple-400 align-top whitespace-nowrap text-xs">
                      {key}
                    </td>
                    <td className="py-1.5 text-gray-300 break-all text-xs">
                      {value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Raw Data (collapsible) */}
        <div>
          <button
            onClick={() => setShowRaw(!showRaw)}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors mb-2"
          >
            {showRaw ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {showRaw ? 'Hide raw data' : 'Show raw data...'}
          </button>
          {showRaw && (
            <div className="bg-gray-50 dark:bg-gray-900/50 rounded p-3">
              <ObjectTree data={{
                ...metadata,
                labels: filteredLabels,
                annotations: filteredAnnotations,
              }} />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// Metadata table row
function MetadataRow({ label, value, truncate }: { label: string; value: string; truncate?: boolean }) {
  return (
    <tr className="border-b border-gray-200 dark:border-gray-700/50 last:border-0">
      <td className="py-1.5 pr-4 text-gray-500 whitespace-nowrap w-32">{label}</td>
      <td className={`py-1.5 text-gray-900 dark:text-gray-100 ${truncate ? 'truncate max-w-xs' : ''}`} title={value}>
        {value}
      </td>
    </tr>
  );
}

// Format timestamp for display
function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  let age: string;
  if (days > 0) age = `${days}d ago`;
  else if (hours > 0) age = `${hours}h ago`;
  else if (minutes > 0) age = `${minutes}m ago`;
  else age = `${seconds}s ago`;

  return `${date.toLocaleString()} (${age})`;
}

// Events section component
function EventsSection({ events, loading }: { events: CoreV1Event[]; loading: boolean }) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <section className="mb-4">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 text-left py-2 hover:bg-gray-100 dark:hover:bg-gray-800/30 rounded transition-colors"
      >
        {isOpen ? (
          <ChevronDown size={16} className="text-gray-500" />
        ) : (
          <ChevronRight size={16} className="text-gray-500" />
        )}
        <h4 className="text-xs font-medium uppercase tracking-wider text-gray-400">
          Events {events.length > 0 && `(${events.length})`}
        </h4>
        {loading && <Loader2 size={12} className="animate-spin text-gray-500" />}
      </button>
      {isOpen && (
        <div className="bg-gray-100 dark:bg-gray-800/50 rounded-lg p-4 mt-2 overflow-auto">
          {loading && events.length === 0 ? (
            <div className="flex items-center gap-2 text-gray-500 text-sm">
              <Loader2 size={14} className="animate-spin" />
              Loading events...
            </div>
          ) : events.length === 0 ? (
            <div className="text-gray-500 text-sm italic">No events found</div>
          ) : (
            <div className="space-y-3">
              {events.map((event) => (
                <EventItem key={event.metadata.uid} event={event} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
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

// Collapsible section component
function CollapsibleSection({ 
  title, 
  children, 
  defaultOpen = false 
}: { 
  title: string; 
  children: React.ReactNode; 
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section className="mb-4">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 text-left py-2 hover:bg-gray-100 dark:hover:bg-gray-800/30 rounded transition-colors"
      >
        {isOpen ? (
          <ChevronDown size={16} className="text-gray-500" />
        ) : (
          <ChevronRight size={16} className="text-gray-500" />
        )}
        <h4 className="text-xs font-medium uppercase tracking-wider text-gray-400">
          {title}
        </h4>
      </button>
      {isOpen && (
        <div className="bg-gray-100 dark:bg-gray-800/50 rounded-lg p-4 mt-2 overflow-auto">
          {children}
        </div>
      )}
    </section>
  );
}
