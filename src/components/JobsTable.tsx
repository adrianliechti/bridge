import { useKubernetesQuery } from '../hooks/useKubernetesQuery';
import { getJobs } from '../api/kubernetes';
import { ResourceTable } from './ResourceTable';
import { AutoStatusBadge } from './StatusBadge';
import { formatAge } from '../utils/format';
import type { Job } from '../types/kubernetes';

interface JobsTableProps {
  namespace?: string;
}

export function JobsTable({ namespace }: JobsTableProps) {
  const { data, loading, error } = useKubernetesQuery(
    () => getJobs(namespace),
    [namespace]
  );

  const getJobStatus = (job: Job): string => {
    if (job.status?.succeeded) return 'Complete';
    if (job.status?.failed) return 'Failed';
    if (job.status?.active) return 'Running';
    return 'Pending';
  };

  const getDuration = (job: Job): string => {
    if (!job.status?.startTime) return '-';
    const start = new Date(job.status.startTime);
    const end = job.status.completionTime
      ? new Date(job.status.completionTime)
      : new Date();
    const diffMs = end.getTime() - start.getTime();
    const seconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) return `${hours}h${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m${seconds % 60}s`;
    return `${seconds}s`;
  };

  const columns = [
    {
      header: 'NAMESPACE',
      accessor: (job: Job) => job.metadata.namespace || '-',
    },
    {
      header: 'NAME',
      accessor: (job: Job) => job.metadata.name,
    },
    {
      header: 'STATUS',
      accessor: (job: Job) => <AutoStatusBadge status={getJobStatus(job)} />,
    },
    {
      header: 'COMPLETIONS',
      accessor: (job: Job) =>
        `${job.status?.succeeded || 0}/${job.spec?.completions || 1}`,
    },
    {
      header: 'DURATION',
      accessor: (job: Job) => getDuration(job),
    },
    {
      header: 'AGE',
      accessor: (job: Job) => formatAge(job.metadata.creationTimestamp),
    },
  ];

  return (
    <ResourceTable
      columns={columns}
      data={data?.items || []}
      keyExtractor={(job) => job.metadata.uid}
      loading={loading}
      error={error}
      emptyMessage="No jobs found"
    />
  );
}
