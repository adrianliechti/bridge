import { useKubernetesQuery } from '../hooks/useKubernetesQuery';
import { getNodes } from '../api/kubernetes';
import { ResourceTable } from './ResourceTable';
import { AutoStatusBadge } from './StatusBadge';
import { formatAge } from '../utils/format';
import type { Node } from '../types/kubernetes';

export function NodesTable() {
  const { data, loading, error } = useKubernetesQuery(() => getNodes(), []);

  const getNodeStatus = (node: Node): string => {
    const conditions = node.status?.conditions || [];
    const ready = conditions.find((c) => c.type === 'Ready');
    if (ready?.status === 'True') return 'Ready';
    if (ready?.status === 'False') return 'NotReady';
    return 'Unknown';
  };

  const getNodeRoles = (node: Node): string => {
    const labels = node.metadata?.labels || {};
    const roles: string[] = [];
    for (const [key] of Object.entries(labels)) {
      if (key.startsWith('node-role.kubernetes.io/')) {
        roles.push(key.replace('node-role.kubernetes.io/', ''));
      }
    }
    return roles.length > 0 ? roles.join(', ') : '<none>';
  };

  const getInternalIP = (node: Node): string => {
    const addresses = node.status?.addresses || [];
    const internal = addresses.find((a) => a.type === 'InternalIP');
    return internal?.address || '-';
  };

  const columns = [
    {
      header: 'NAME',
      accessor: (node: Node) => node.metadata.name,
    },
    {
      header: 'STATUS',
      accessor: (node: Node) => <AutoStatusBadge status={getNodeStatus(node)} />,
    },
    {
      header: 'ROLES',
      accessor: (node: Node) => getNodeRoles(node),
    },
    {
      header: 'AGE',
      accessor: (node: Node) => formatAge(node.metadata.creationTimestamp),
    },
    {
      header: 'VERSION',
      accessor: (node: Node) => node.status?.nodeInfo?.kubeletVersion || '-',
    },
    {
      header: 'INTERNAL-IP',
      accessor: (node: Node) => getInternalIP(node),
    },
    {
      header: 'OS-IMAGE',
      accessor: (node: Node) => node.status?.nodeInfo?.osImage || '-',
    },
  ];

  return (
    <ResourceTable
      columns={columns}
      data={data?.items || []}
      keyExtractor={(node) => node.metadata.uid}
      loading={loading}
      error={error}
      emptyMessage="No nodes found"
    />
  );
}
