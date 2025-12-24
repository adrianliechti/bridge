import { useKubernetesQuery } from '../hooks/useKubernetesQuery';
import { getPods } from '../api/kubernetes';
import { ResourceTable } from './ResourceTable';
import { AutoStatusBadge } from './StatusBadge';
import { formatAge } from '../utils/format';
import type { Pod } from '../types/kubernetes';

interface PodsTableProps {
  namespace?: string;
}

export function PodsTable({ namespace }: PodsTableProps) {
  const { data, loading, error } = useKubernetesQuery(
    () => getPods(namespace),
    [namespace]
  );

  const getReadyCount = (pod: Pod): string => {
    const containers = pod.status?.containerStatuses || [];
    const ready = containers.filter((c) => c.ready).length;
    const total = containers.length || pod.spec?.containers?.length || 0;
    return `${ready}/${total}`;
  };

  const getRestarts = (pod: Pod): number => {
    const containers = pod.status?.containerStatuses || [];
    return containers.reduce((sum, c) => sum + (c.restartCount || 0), 0);
  };

  const columns = [
    {
      header: 'NAMESPACE',
      accessor: (pod: Pod) => pod.metadata.namespace || '-',
    },
    {
      header: 'NAME',
      accessor: (pod: Pod) => pod.metadata.name,
    },
    {
      header: 'READY',
      accessor: (pod: Pod) => getReadyCount(pod),
    },
    {
      header: 'STATUS',
      accessor: (pod: Pod) => <AutoStatusBadge status={pod.status?.phase || 'Unknown'} />,
    },
    {
      header: 'RESTARTS',
      accessor: (pod: Pod) => getRestarts(pod),
    },
    {
      header: 'AGE',
      accessor: (pod: Pod) => formatAge(pod.metadata.creationTimestamp),
    },
    {
      header: 'IP',
      accessor: (pod: Pod) => pod.status?.podIP || '-',
    },
    {
      header: 'NODE',
      accessor: (pod: Pod) => pod.spec?.nodeName || '-',
    },
  ];

  return (
    <ResourceTable
      columns={columns}
      data={data?.items || []}
      keyExtractor={(pod) => pod.metadata.uid}
      loading={loading}
      error={error}
      emptyMessage="No pods found"
    />
  );
}
