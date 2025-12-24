import { useKubernetesQuery } from '../hooks/useKubernetesQuery';
import { getServices } from '../api/kubernetes';
import { ResourceTable } from './ResourceTable';
import { formatAge } from '../utils/format';
import type { Service } from '../types/kubernetes';

interface ServicesTableProps {
  namespace?: string;
}

export function ServicesTable({ namespace }: ServicesTableProps) {
  const { data, loading, error } = useKubernetesQuery(
    () => getServices(namespace),
    [namespace]
  );

  const formatPorts = (service: Service): string => {
    const ports = service.spec?.ports || [];
    return ports
      .map((p) => {
        let portStr = `${p.port}`;
        if (p.nodePort) portStr += `:${p.nodePort}`;
        if (p.protocol && p.protocol !== 'TCP') portStr += `/${p.protocol}`;
        return portStr;
      })
      .join(', ') || '-';
  };

  const getExternalIP = (service: Service): string => {
    if (service.spec?.type === 'LoadBalancer') {
      const ingress = service.status?.loadBalancer?.ingress;
      if (ingress && ingress.length > 0) {
        return ingress.map((i) => i.ip || i.hostname).join(', ');
      }
      return '<pending>';
    }
    if (service.spec?.externalIPs?.length) {
      return service.spec.externalIPs.join(', ');
    }
    return '<none>';
  };

  const columns = [
    {
      header: 'NAMESPACE',
      accessor: (svc: Service) => svc.metadata.namespace || '-',
    },
    {
      header: 'NAME',
      accessor: (svc: Service) => svc.metadata.name,
    },
    {
      header: 'TYPE',
      accessor: (svc: Service) => svc.spec?.type || 'ClusterIP',
    },
    {
      header: 'CLUSTER-IP',
      accessor: (svc: Service) => svc.spec?.clusterIP || '-',
    },
    {
      header: 'EXTERNAL-IP',
      accessor: (svc: Service) => getExternalIP(svc),
    },
    {
      header: 'PORT(S)',
      accessor: (svc: Service) => formatPorts(svc),
    },
    {
      header: 'AGE',
      accessor: (svc: Service) => formatAge(svc.metadata.creationTimestamp),
    },
  ];

  return (
    <ResourceTable
      columns={columns}
      data={data?.items || []}
      keyExtractor={(svc) => svc.metadata.uid}
      loading={loading}
      error={error}
      emptyMessage="No services found"
    />
  );
}
