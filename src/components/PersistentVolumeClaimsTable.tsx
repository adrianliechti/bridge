import { useKubernetesQuery } from '../hooks/useKubernetesQuery';
import { getPersistentVolumeClaims } from '../api/kubernetes';
import { ResourceTable } from './ResourceTable';
import { AutoStatusBadge } from './StatusBadge';
import { formatAge } from '../utils/format';
import type { PersistentVolumeClaim } from '../types/kubernetes';

interface PersistentVolumeClaimsTableProps {
  namespace?: string;
}

export function PersistentVolumeClaimsTable({
  namespace,
}: PersistentVolumeClaimsTableProps) {
  const { data, loading, error } = useKubernetesQuery(
    () => getPersistentVolumeClaims(namespace),
    [namespace]
  );

  const columns = [
    {
      header: 'NAMESPACE',
      accessor: (pvc: PersistentVolumeClaim) => pvc.metadata.namespace || '-',
    },
    {
      header: 'NAME',
      accessor: (pvc: PersistentVolumeClaim) => pvc.metadata.name,
    },
    {
      header: 'STATUS',
      accessor: (pvc: PersistentVolumeClaim) => (
        <AutoStatusBadge status={pvc.status?.phase || 'Unknown'} />
      ),
    },
    {
      header: 'VOLUME',
      accessor: (pvc: PersistentVolumeClaim) => pvc.spec?.volumeName || '-',
    },
    {
      header: 'CAPACITY',
      accessor: (pvc: PersistentVolumeClaim) =>
        pvc.status?.capacity?.storage || '-',
    },
    {
      header: 'ACCESS MODES',
      accessor: (pvc: PersistentVolumeClaim) =>
        pvc.status?.accessModes?.join(', ') || '-',
    },
    {
      header: 'STORAGECLASS',
      accessor: (pvc: PersistentVolumeClaim) => pvc.spec?.storageClassName || '-',
    },
    {
      header: 'AGE',
      accessor: (pvc: PersistentVolumeClaim) =>
        formatAge(pvc.metadata.creationTimestamp),
    },
  ];

  return (
    <ResourceTable
      columns={columns}
      data={data?.items || []}
      keyExtractor={(pvc) => pvc.metadata.uid}
      loading={loading}
      error={error}
      emptyMessage="No persistent volume claims found"
    />
  );
}
