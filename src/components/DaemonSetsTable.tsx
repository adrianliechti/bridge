import { useKubernetesQuery } from '../hooks/useKubernetesQuery';
import { getDaemonSets } from '../api/kubernetes';
import { ResourceTable } from './ResourceTable';
import { formatAge } from '../utils/format';
import type { DaemonSet } from '../types/kubernetes';

interface DaemonSetsTableProps {
  namespace?: string;
}

export function DaemonSetsTable({ namespace }: DaemonSetsTableProps) {
  const { data, loading, error } = useKubernetesQuery(
    () => getDaemonSets(namespace),
    [namespace]
  );

  const columns = [
    {
      header: 'NAMESPACE',
      accessor: (ds: DaemonSet) => ds.metadata.namespace || '-',
    },
    {
      header: 'NAME',
      accessor: (ds: DaemonSet) => ds.metadata.name,
    },
    {
      header: 'DESIRED',
      accessor: (ds: DaemonSet) => ds.status?.desiredNumberScheduled || 0,
    },
    {
      header: 'CURRENT',
      accessor: (ds: DaemonSet) => ds.status?.currentNumberScheduled || 0,
    },
    {
      header: 'READY',
      accessor: (ds: DaemonSet) => ds.status?.numberReady || 0,
    },
    {
      header: 'UP-TO-DATE',
      accessor: (ds: DaemonSet) => ds.status?.updatedNumberScheduled || 0,
    },
    {
      header: 'AVAILABLE',
      accessor: (ds: DaemonSet) => ds.status?.numberAvailable || 0,
    },
    {
      header: 'AGE',
      accessor: (ds: DaemonSet) => formatAge(ds.metadata.creationTimestamp),
    },
  ];

  return (
    <ResourceTable
      columns={columns}
      data={data?.items || []}
      keyExtractor={(ds) => ds.metadata.uid}
      loading={loading}
      error={error}
      emptyMessage="No daemon sets found"
    />
  );
}
