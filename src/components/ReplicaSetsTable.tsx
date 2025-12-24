import { useKubernetesQuery } from '../hooks/useKubernetesQuery';
import { getReplicaSets } from '../api/kubernetes';
import { ResourceTable } from './ResourceTable';
import { formatAge } from '../utils/format';
import type { ReplicaSet } from '../types/kubernetes';

interface ReplicaSetsTableProps {
  namespace?: string;
}

export function ReplicaSetsTable({ namespace }: ReplicaSetsTableProps) {
  const { data, loading, error } = useKubernetesQuery(
    () => getReplicaSets(namespace),
    [namespace]
  );

  const columns = [
    {
      header: 'NAMESPACE',
      accessor: (rs: ReplicaSet) => rs.metadata.namespace || '-',
    },
    {
      header: 'NAME',
      accessor: (rs: ReplicaSet) => rs.metadata.name,
    },
    {
      header: 'DESIRED',
      accessor: (rs: ReplicaSet) => rs.spec?.replicas || 0,
    },
    {
      header: 'CURRENT',
      accessor: (rs: ReplicaSet) => rs.status?.replicas || 0,
    },
    {
      header: 'READY',
      accessor: (rs: ReplicaSet) => rs.status?.readyReplicas || 0,
    },
    {
      header: 'AGE',
      accessor: (rs: ReplicaSet) => formatAge(rs.metadata.creationTimestamp),
    },
  ];

  return (
    <ResourceTable
      columns={columns}
      data={data?.items || []}
      keyExtractor={(rs) => rs.metadata.uid}
      loading={loading}
      error={error}
      emptyMessage="No replica sets found"
    />
  );
}
