import { useKubernetesQuery } from '../hooks/useKubernetesQuery';
import { getConfigMaps } from '../api/kubernetes';
import { ResourceTable } from './ResourceTable';
import { formatAge } from '../utils/format';
import type { ConfigMap } from '../types/kubernetes';

interface ConfigMapsTableProps {
  namespace?: string;
}

export function ConfigMapsTable({ namespace }: ConfigMapsTableProps) {
  const { data, loading, error } = useKubernetesQuery(
    () => getConfigMaps(namespace),
    [namespace]
  );

  const columns = [
    {
      header: 'NAMESPACE',
      accessor: (cm: ConfigMap) => cm.metadata.namespace || '-',
    },
    {
      header: 'NAME',
      accessor: (cm: ConfigMap) => cm.metadata.name,
    },
    {
      header: 'DATA',
      accessor: (cm: ConfigMap) => Object.keys(cm.data || {}).length,
    },
    {
      header: 'AGE',
      accessor: (cm: ConfigMap) => formatAge(cm.metadata.creationTimestamp),
    },
  ];

  return (
    <ResourceTable
      columns={columns}
      data={data?.items || []}
      keyExtractor={(cm) => cm.metadata.uid}
      loading={loading}
      error={error}
      emptyMessage="No config maps found"
    />
  );
}
