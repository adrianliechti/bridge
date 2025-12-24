import { useKubernetesQuery } from '../hooks/useKubernetesQuery';
import { getStatefulSets } from '../api/kubernetes';
import { ResourceTable } from './ResourceTable';
import { formatAge } from '../utils/format';
import type { StatefulSet } from '../types/kubernetes';

interface StatefulSetsTableProps {
  namespace?: string;
}

export function StatefulSetsTable({ namespace }: StatefulSetsTableProps) {
  const { data, loading, error } = useKubernetesQuery(
    () => getStatefulSets(namespace),
    [namespace]
  );

  const columns = [
    {
      header: 'NAMESPACE',
      accessor: (sts: StatefulSet) => sts.metadata.namespace || '-',
    },
    {
      header: 'NAME',
      accessor: (sts: StatefulSet) => sts.metadata.name,
    },
    {
      header: 'READY',
      accessor: (sts: StatefulSet) =>
        `${sts.status?.readyReplicas || 0}/${sts.spec?.replicas || 0}`,
    },
    {
      header: 'AGE',
      accessor: (sts: StatefulSet) => formatAge(sts.metadata.creationTimestamp),
    },
  ];

  return (
    <ResourceTable
      columns={columns}
      data={data?.items || []}
      keyExtractor={(sts) => sts.metadata.uid}
      loading={loading}
      error={error}
      emptyMessage="No stateful sets found"
    />
  );
}
