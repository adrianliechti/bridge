import { useKubernetesQuery } from '../hooks/useKubernetesQuery';
import { getSecrets } from '../api/kubernetes';
import { ResourceTable } from './ResourceTable';
import { formatAge } from '../utils/format';
import type { Secret } from '../types/kubernetes';

interface SecretsTableProps {
  namespace?: string;
}

export function SecretsTable({ namespace }: SecretsTableProps) {
  const { data, loading, error } = useKubernetesQuery(
    () => getSecrets(namespace),
    [namespace]
  );

  const columns = [
    {
      header: 'NAMESPACE',
      accessor: (secret: Secret) => secret.metadata.namespace || '-',
    },
    {
      header: 'NAME',
      accessor: (secret: Secret) => secret.metadata.name,
    },
    {
      header: 'TYPE',
      accessor: (secret: Secret) => secret.type || '-',
    },
    {
      header: 'DATA',
      accessor: (secret: Secret) => Object.keys(secret.data || {}).length,
    },
    {
      header: 'AGE',
      accessor: (secret: Secret) => formatAge(secret.metadata.creationTimestamp),
    },
  ];

  return (
    <ResourceTable
      columns={columns}
      data={data?.items || []}
      keyExtractor={(secret) => secret.metadata.uid}
      loading={loading}
      error={error}
      emptyMessage="No secrets found"
    />
  );
}
