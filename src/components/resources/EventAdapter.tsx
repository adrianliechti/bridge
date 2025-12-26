// Event Adapter (v1)
// Extracts display data from Kubernetes Event resources

import { AlertTriangle, Info, Calendar, Hash, Target, Server, RefreshCw } from 'lucide-react';
import type { ResourceAdapter, ResourceSections, Section } from './types';
import { getStandardMetadataSections } from './utils';

// Event types based on CoreV1Event
interface EventSource {
  component?: string;
  host?: string;
}

interface ObjectReference {
  kind?: string;
  namespace?: string;
  name?: string;
  uid?: string;
  apiVersion?: string;
  resourceVersion?: string;
  fieldPath?: string;
}

interface Event {
  apiVersion?: string;
  kind?: string;
  metadata?: {
    name?: string;
    namespace?: string;
    uid?: string;
    creationTimestamp?: string | Date;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  involvedObject?: ObjectReference;
  reason?: string;
  message?: string;
  source?: EventSource;
  firstTimestamp?: string | Date;
  lastTimestamp?: string | Date;
  count?: number;
  type?: string;
  eventTime?: string | Date;
  reportingComponent?: string;
  reportingInstance?: string;
  action?: string;
  related?: ObjectReference;
}

// Helper to safely get timestamp string
function getTimestampString(timestamp?: string | Date): string | undefined {
  if (!timestamp) return undefined;
  if (timestamp instanceof Date) return timestamp.toISOString();
  return timestamp;
}

// Format timestamp for display
function formatTimestamp(timestamp?: string | Date): string {
  const ts = getTimestampString(timestamp);
  if (!ts) return 'N/A';
  const date = new Date(ts);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// Format relative time
function formatRelativeTime(timestamp?: string | Date): string {
  const ts = getTimestampString(timestamp);
  if (!ts) return 'N/A';
  
  const date = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  if (seconds > 0) return `${seconds}s ago`;
  return 'just now';
}

export const EventAdapter: ResourceAdapter<Event> = {
  kinds: ['Event', 'Events'],

  adapt(resource): ResourceSections {
    const metadata = resource.metadata;
    const involvedObject = resource.involvedObject;
    const source = resource.source;

    const isWarning = resource.type === 'Warning';
    const count = resource.count ?? 1;
    const firstTime = resource.firstTimestamp || resource.eventTime || metadata?.creationTimestamp;
    const lastTime = resource.lastTimestamp || resource.eventTime;

    const sections: Section[] = [
      // Event type and reason
      {
        id: 'status',
        data: {
          type: 'status-cards',
          items: [
            {
              label: 'Type',
              value: resource.type || 'Normal',
              status: isWarning ? 'warning' : 'success',
              icon: isWarning 
                ? <AlertTriangle size={14} className="text-amber-400" />
                : <Info size={14} className="text-emerald-400" />,
            },
            {
              label: 'Reason',
              value: resource.reason || 'Unknown',
              status: 'neutral',
            },
            ...(count > 1 ? [{
              label: 'Count',
              value: count,
              status: 'neutral' as const,
              icon: <Hash size={14} className="text-blue-400" />,
            }] : []),
          ],
        },
      },
    ];

    // Labels and Annotations
    sections.push(...getStandardMetadataSections(metadata));

    // Message
    if (resource.message) {
      sections.push({
        id: 'message',
        title: 'Message',
        data: {
          type: 'custom',
          render: () => (
            <div className={`p-3 rounded-lg border ${
              isWarning 
                ? 'bg-amber-500/10 border-amber-500/30' 
                : 'bg-neutral-900/50 border-neutral-700'
            }`}>
              <p className="text-sm text-neutral-300 whitespace-pre-wrap">{resource.message}</p>
            </div>
          ),
        },
      });
    }

    // Involved Object
    if (involvedObject && involvedObject.name) {
      sections.push({
        id: 'involved-object',
        title: 'Involved Object',
        data: {
          type: 'custom',
          render: () => (
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Target size={14} className="text-blue-400" />
                <span className="text-sm font-medium text-blue-300">
                  {involvedObject.kind || 'Resource'}
                </span>
              </div>
              <div className="space-y-1 text-xs">
                <div className="text-neutral-300">
                  <span className="text-neutral-500">Name: </span>
                  <span className="text-cyan-400 font-mono">{involvedObject.name}</span>
                </div>
                {involvedObject.namespace && (
                  <div className="text-neutral-300">
                    <span className="text-neutral-500">Namespace: </span>
                    <span className="text-purple-400">{involvedObject.namespace}</span>
                  </div>
                )}
                {involvedObject.fieldPath && (
                  <div className="text-neutral-300">
                    <span className="text-neutral-500">Field: </span>
                    <span className="text-neutral-400 font-mono">{involvedObject.fieldPath}</span>
                  </div>
                )}
                {involvedObject.apiVersion && (
                  <div className="text-neutral-300">
                    <span className="text-neutral-500">API Version: </span>
                    <span className="text-neutral-400">{involvedObject.apiVersion}</span>
                  </div>
                )}
              </div>
            </div>
          ),
        },
      });
    }

    // Timestamps
    sections.push({
      id: 'timestamps',
      title: 'Timestamps',
      data: {
        type: 'custom',
        render: () => (
          <div className="space-y-2">
            {firstTime && (
              <div className="flex items-center gap-2 text-sm">
                <Calendar size={14} className="text-neutral-500" />
                <span className="text-neutral-500">First seen:</span>
                <span className="text-neutral-300">{formatTimestamp(firstTime)}</span>
                <span className="text-neutral-500">({formatRelativeTime(firstTime)})</span>
              </div>
            )}
            {lastTime && count > 1 && (
              <div className="flex items-center gap-2 text-sm">
                <RefreshCw size={14} className="text-neutral-500" />
                <span className="text-neutral-500">Last seen:</span>
                <span className="text-neutral-300">{formatTimestamp(lastTime)}</span>
                <span className="text-neutral-500">({formatRelativeTime(lastTime)})</span>
              </div>
            )}
          </div>
        ),
      },
    });

    // Source
    if (source && (source.component || source.host)) {
      sections.push({
        id: 'source',
        title: 'Source',
        data: {
          type: 'custom',
          render: () => (
            <div className="bg-neutral-900/50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Server size={14} className="text-neutral-400" />
                <span className="text-sm font-medium text-neutral-300">Event Source</span>
              </div>
              <div className="space-y-1 text-xs">
                {source.component && (
                  <div className="text-neutral-300">
                    <span className="text-neutral-500">Component: </span>
                    <span className="text-cyan-400">{source.component}</span>
                  </div>
                )}
                {source.host && (
                  <div className="text-neutral-300">
                    <span className="text-neutral-500">Host: </span>
                    <span className="text-neutral-400 font-mono">{source.host}</span>
                  </div>
                )}
              </div>
            </div>
          ),
        },
      });
    }

    // Reporting info (for newer events API)
    if (resource.reportingComponent || resource.reportingInstance) {
      sections.push({
        id: 'reporting',
        title: 'Reporting',
        data: {
          type: 'info-grid',
          columns: 2,
          items: [
            ...(resource.reportingComponent ? [{ label: 'Component', value: resource.reportingComponent }] : []),
            ...(resource.reportingInstance ? [{ label: 'Instance', value: resource.reportingInstance }] : []),
            ...(resource.action ? [{ label: 'Action', value: resource.action }] : []),
          ],
        },
      });
    }

    // Related object (if different from involved object)
    if (resource.related && resource.related.name && resource.related.name !== involvedObject?.name) {
      sections.push({
        id: 'related',
        title: 'Related Object',
        data: {
          type: 'info-grid',
          columns: 2,
          items: [
            { label: 'Kind', value: resource.related.kind || 'Unknown' },
            { label: 'Name', value: resource.related.name },
            ...(resource.related.namespace ? [{ label: 'Namespace', value: resource.related.namespace }] : []),
          ],
        },
      });
    }

    return { sections };
  },
};
