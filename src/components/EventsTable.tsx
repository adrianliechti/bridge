import { useKubernetesQuery } from '../hooks/useKubernetesQuery';
import { getEvents } from '../api/kubernetes';
import { ResourceTable } from './ResourceTable';
import { AutoStatusBadge } from './StatusBadge';
import { formatAge } from '../utils/format';
import type { Event } from '../types/kubernetes';

interface EventsTableProps {
  namespace?: string;
}

export function EventsTable({ namespace }: EventsTableProps) {
  const { data, loading, error } = useKubernetesQuery(
    () => getEvents(namespace),
    [namespace]
  );

  // Sort events by last timestamp (most recent first)
  const sortedEvents = [...(data?.items || [])].sort((a, b) => {
    const aTime = a.lastTimestamp || a.metadata.creationTimestamp;
    const bTime = b.lastTimestamp || b.metadata.creationTimestamp;
    return new Date(bTime).getTime() - new Date(aTime).getTime();
  });

  const columns = [
    {
      header: 'NAMESPACE',
      accessor: (event: Event) => event.metadata.namespace || '-',
    },
    {
      header: 'LAST SEEN',
      accessor: (event: Event) =>
        formatAge(event.lastTimestamp || event.metadata.creationTimestamp),
    },
    {
      header: 'TYPE',
      accessor: (event: Event) => (
        <AutoStatusBadge
          status={event.type || 'Normal'}
        />
      ),
    },
    {
      header: 'REASON',
      accessor: (event: Event) => event.reason || '-',
    },
    {
      header: 'OBJECT',
      accessor: (event: Event) =>
        `${event.involvedObject.kind}/${event.involvedObject.name}`,
    },
    {
      header: 'MESSAGE',
      accessor: (event: Event) => (
        <span title={event.message} className="message-cell">
          {event.message}
        </span>
      ),
    },
  ];

  return (
    <ResourceTable
      columns={columns}
      data={sortedEvents}
      keyExtractor={(event) => event.metadata.uid}
      loading={loading}
      error={error}
      emptyMessage="No events found"
    />
  );
}
