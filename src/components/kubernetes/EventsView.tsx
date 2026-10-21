import { Loader2 } from 'lucide-react';
import type { CoreV1Event } from '../../api/kubernetes/kubernetes';

// Events tab component (full page, no collapse)
export function EventsView({
  events,
  loading,
  error,
  onRetry,
}: {
  events: CoreV1Event[];
  loading: boolean;
  error?: Error | null;
  onRetry?: () => void;
}) {
  if (error && events.length === 0) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300"
      >
        <p className="font-medium">Could not load events</p>
        <p className="mt-1 break-words">{error.message}</p>
        <button type="button" onClick={onRetry} className="mt-3 underline">
          Retry
        </button>
      </div>
    );
  }
  if (loading && events.length === 0) {
    return (
      <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-500 text-sm">
        <Loader2 size={14} className="animate-spin" />
        Loading events...
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-200 px-5 py-8 text-center dark:border-neutral-700">
        <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          No events recorded
        </p>
        <p className="mt-1 text-xs text-neutral-500">
          Events appear here when Kubernetes reports activity for this resource.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {error && (
        <div role="alert" className="text-xs text-amber-700 dark:text-amber-400">
          Could not refresh events. Showing the last loaded events.{' '}
          <button type="button" onClick={onRetry} className="underline">
            Retry
          </button>
        </div>
      )}
      {events.map((event) => (
        <EventItem
          key={event.metadata?.uid || `${event.reason}-${event.lastTimestamp}`}
          event={event}
        />
      ))}
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
    return '';
  };

  const timestamp = getTimestamp();
  const isWarning = event.type === 'Warning';

  return (
    <div
      className={`p-3 rounded-lg border ${
        isWarning
          ? 'bg-amber-500/5 border-amber-500/20'
          : 'bg-neutral-100 dark:bg-neutral-900/50 border-neutral-300 dark:border-neutral-700/50'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-2">
          <span
            className={`px-1.5 py-0.5 rounded text-xs font-medium ${
              isWarning
                ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                : 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
            }`}
          >
            {event.type}
          </span>
          <span className="text-sm font-medium text-neutral-900 dark:text-neutral-200">
            {event.reason}
          </span>
        </div>
        <span className="text-xs text-neutral-600 dark:text-neutral-500 whitespace-nowrap">
          {formatEventTime(timestamp)}
        </span>
      </div>
      <p className="text-sm text-neutral-700 dark:text-neutral-400">{event.message}</p>
      {event.count && event.count > 1 && (
        <p className="text-xs text-neutral-600 dark:text-neutral-500 mt-1">
          Occurred {event.count} times
        </p>
      )}
    </div>
  );
}

// Format event timestamp
function formatEventTime(timestamp: string): string {
  if (!timestamp) return 'Unknown time';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'Unknown time';
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
