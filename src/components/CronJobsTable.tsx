import { useKubernetesQuery } from '../hooks/useKubernetesQuery';
import { getCronJobs } from '../api/kubernetes';
import { ResourceTable } from './ResourceTable';
import { AutoStatusBadge } from './StatusBadge';
import { formatAge } from '../utils/format';
import type { CronJob } from '../types/kubernetes';

interface CronJobsTableProps {
  namespace?: string;
}

export function CronJobsTable({ namespace }: CronJobsTableProps) {
  const { data, loading, error } = useKubernetesQuery(
    () => getCronJobs(namespace),
    [namespace]
  );

  const formatLastSchedule = (cronJob: CronJob): string => {
    if (!cronJob.status?.lastScheduleTime) return '<none>';
    return formatAge(cronJob.status.lastScheduleTime);
  };

  const columns = [
    {
      header: 'NAMESPACE',
      accessor: (cj: CronJob) => cj.metadata.namespace || '-',
    },
    {
      header: 'NAME',
      accessor: (cj: CronJob) => cj.metadata.name,
    },
    {
      header: 'SCHEDULE',
      accessor: (cj: CronJob) => cj.spec?.schedule || '-',
    },
    {
      header: 'SUSPEND',
      accessor: (cj: CronJob) => (
        <AutoStatusBadge status={cj.spec?.suspend ? 'Suspended' : 'Active'} />
      ),
    },
    {
      header: 'ACTIVE',
      accessor: (cj: CronJob) => cj.status?.active?.length || 0,
    },
    {
      header: 'LAST SCHEDULE',
      accessor: (cj: CronJob) => formatLastSchedule(cj),
    },
    {
      header: 'AGE',
      accessor: (cj: CronJob) => formatAge(cj.metadata.creationTimestamp),
    },
  ];

  return (
    <ResourceTable
      columns={columns}
      data={data?.items || []}
      keyExtractor={(cj) => cj.metadata.uid}
      loading={loading}
      error={error}
      emptyMessage="No cron jobs found"
    />
  );
}
