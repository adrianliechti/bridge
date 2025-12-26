import { Loader2 } from 'lucide-react';
import type { CoreV1Event } from '../../api/kubernetes';

// Events tab component (full page, no collapse)
export function EventsView({ events, loading }: { events: CoreV1Event[]; loading: boolean }) {
  if (loading && events.length === 0) {
    return (
      <div className="flex items-center gap-2 text-neutral-500 text-sm">
        <Loader2 size={14} className="animate-spin" />
        Loading events...
      </div>
    );
  }
  
  if (events.length === 0) {
    return (
      <div className="text-neutral-500 text-sm italic">No events found for this resource</div>
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
          <h5 className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2">
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
        : 'bg-neutral-900/50 border-neutral-700/50'
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
          <span className="text-sm font-medium text-neutral-200">{event.reason}</span>
        </div>
        <span className="text-xs text-neutral-500 whitespace-nowrap">
          {formatEventTime(timestamp)}
        </span>
      </div>
      <p className="text-sm text-neutral-400">{event.message}</p>
      {event.count && event.count > 1 && (
        <p className="text-xs text-neutral-500 mt-1">
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
