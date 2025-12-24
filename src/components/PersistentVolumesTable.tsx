import { useKubernetesQuery } from '../hooks/useKubernetesQuery';
import { getPersistentVolumes } from '../api/kubernetes';
import { ResourceTable } from './ResourceTable';
import { AutoStatusBadge } from './StatusBadge';
import { formatAge } from '../utils/format';
import type { PersistentVolume } from '../types/kubernetes';

export function PersistentVolumesTable() {
  const { data, loading, error } = useKubernetesQuery(
    () => getPersistentVolumes(),
    []
  );

  const columns = [
    {
      header: 'NAME',
      accessor: (pv: PersistentVolume) => pv.metadata.name,
    },
    {
      header: 'CAPACITY',
      accessor: (pv: PersistentVolume) =>
        pv.spec?.capacity?.storage || '-',
    },
    {
      header: 'ACCESS MODES',
      accessor: (pv: PersistentVolume) =>
        pv.spec?.accessModes?.join(', ') || '-',
    },
    {
      header: 'RECLAIM POLICY',
      accessor: (pv: PersistentVolume) =>
        pv.spec?.persistentVolumeReclaimPolicy || '-',
    },
    {
      header: 'STATUS',
      accessor: (pv: PersistentVolume) => (
        <AutoStatusBadge status={pv.status?.phase || 'Unknown'} />
      ),
    },
    {
      header: 'CLAIM',
      accessor: (pv: PersistentVolume) =>
        pv.spec?.claimRef
          ? `${pv.spec.claimRef.namespace}/${pv.spec.claimRef.name}`
          : '-',
    },
    {
      header: 'STORAGECLASS',
      accessor: (pv: PersistentVolume) => pv.spec?.storageClassName || '-',
    },
    {
      header: 'AGE',
      accessor: (pv: PersistentVolume) => formatAge(pv.metadata.creationTimestamp),
    },
  ];

  return (
    <ResourceTable
      columns={columns}
      data={data?.items || []}
      keyExtractor={(pv) => pv.metadata.uid}
      loading={loading}
      error={error}
      emptyMessage="No persistent volumes found"
    />
  );
}
