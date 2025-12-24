import { useKubernetesQuery } from '../hooks/useKubernetesQuery';
import { getDeployments } from '../api/kubernetes';
import { ResourceTable } from './ResourceTable';
import { AutoStatusBadge } from './StatusBadge';
import { formatAge } from '../utils/format';
import type { Deployment } from '../types/kubernetes';

interface DeploymentsTableProps {
  namespace?: string;
}

export function DeploymentsTable({ namespace }: DeploymentsTableProps) {
  const { data, loading, error } = useKubernetesQuery(
    () => getDeployments(namespace),
    [namespace]
  );

  const getConditionStatus = (deployment: Deployment): string => {
    const conditions = deployment.status?.conditions || [];
    const available = conditions.find((c) => c.type === 'Available');
    if (available?.status === 'True') return 'Available';
    const progressing = conditions.find((c) => c.type === 'Progressing');
    if (progressing?.status === 'True') return 'Progressing';
    return 'Unknown';
  };

  const columns = [
    {
      header: 'NAMESPACE',
      accessor: (dep: Deployment) => dep.metadata.namespace || '-',
    },
    {
      header: 'NAME',
      accessor: (dep: Deployment) => dep.metadata.name,
    },
    {
      header: 'READY',
      accessor: (dep: Deployment) =>
        `${dep.status?.readyReplicas || 0}/${dep.spec?.replicas || 0}`,
    },
    {
      header: 'UP-TO-DATE',
      accessor: (dep: Deployment) => dep.status?.updatedReplicas || 0,
    },
    {
      header: 'AVAILABLE',
      accessor: (dep: Deployment) => dep.status?.availableReplicas || 0,
    },
    {
      header: 'STATUS',
      accessor: (dep: Deployment) => (
        <AutoStatusBadge status={getConditionStatus(dep)} />
      ),
    },
    {
      header: 'AGE',
      accessor: (dep: Deployment) => formatAge(dep.metadata.creationTimestamp),
    },
  ];

  return (
    <ResourceTable
      columns={columns}
      data={data?.items || []}
      keyExtractor={(dep) => dep.metadata.uid}
      loading={loading}
      error={error}
      emptyMessage="No deployments found"
    />
  );
}
