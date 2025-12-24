import { useKubernetesQuery } from '../hooks/useKubernetesQuery';
import { getIngresses } from '../api/kubernetes';
import { ResourceTable } from './ResourceTable';
import { formatAge } from '../utils/format';
import type { Ingress } from '../types/kubernetes';

interface IngressesTableProps {
  namespace?: string;
}

export function IngressesTable({ namespace }: IngressesTableProps) {
  const { data, loading, error } = useKubernetesQuery(
    () => getIngresses(namespace),
    [namespace]
  );

  const getHosts = (ingress: Ingress): string => {
    const rules = ingress.spec?.rules || [];
    const hosts = rules.map((r) => r.host).filter(Boolean);
    return hosts.length > 0 ? hosts.join(', ') : '*';
  };

  const getAddress = (ingress: Ingress): string => {
    const lb = ingress.status?.loadBalancer?.ingress;
    if (!lb || lb.length === 0) return '-';
    return lb.map((i) => i.ip || i.hostname).join(', ');
  };

  const getPorts = (ingress: Ingress): string => {
    const hasTLS = ingress.spec?.tls && ingress.spec.tls.length > 0;
    return hasTLS ? '80, 443' : '80';
  };

  const columns = [
    {
      header: 'NAMESPACE',
      accessor: (ing: Ingress) => ing.metadata.namespace || '-',
    },
    {
      header: 'NAME',
      accessor: (ing: Ingress) => ing.metadata.name,
    },
    {
      header: 'CLASS',
      accessor: (ing: Ingress) => ing.spec?.ingressClassName || '<none>',
    },
    {
      header: 'HOSTS',
      accessor: (ing: Ingress) => getHosts(ing),
    },
    {
      header: 'ADDRESS',
      accessor: (ing: Ingress) => getAddress(ing),
    },
    {
      header: 'PORTS',
      accessor: (ing: Ingress) => getPorts(ing),
    },
    {
      header: 'AGE',
      accessor: (ing: Ingress) => formatAge(ing.metadata.creationTimestamp),
    },
  ];

  return (
    <ResourceTable
      columns={columns}
      data={data?.items || []}
      keyExtractor={(ing) => ing.metadata.uid}
      loading={loading}
      error={error}
      emptyMessage="No ingresses found"
    />
  );
}
