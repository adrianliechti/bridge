import { useKubernetesQuery } from '../hooks/useKubernetesQuery';
import { getNamespaces } from '../api/kubernetes';
import { ResourceTable } from './ResourceTable';
import { AutoStatusBadge } from './StatusBadge';
import { formatAge } from '../utils/format';
import type { Namespace } from '../types/kubernetes';

export function NamespacesTable() {
  const { data, loading, error } = useKubernetesQuery(() => getNamespaces(), []);

  const columns = [
    {
      header: 'NAME',
      accessor: (ns: Namespace) => ns.metadata.name,
    },
    {
      header: 'STATUS',
      accessor: (ns: Namespace) => (
        <AutoStatusBadge status={ns.status?.phase || 'Unknown'} />
      ),
    },
    {
      header: 'AGE',
      accessor: (ns: Namespace) => formatAge(ns.metadata.creationTimestamp),
    },
  ];

  return (
    <ResourceTable
      columns={columns}
      data={data?.items || []}
      keyExtractor={(ns) => ns.metadata.uid}
      loading={loading}
      error={error}
      emptyMessage="No namespaces found"
    />
  );
}
