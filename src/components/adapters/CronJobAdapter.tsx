// CronJob Adapter
// Extracts display data from CronJob resources

import { Play, Pause, Clock } from 'lucide-react';
import type { ResourceAdapter, ResourceSections, JobData } from './types';
import { parseCronSchedule, formatTimeAgo, getContainerSections } from './utils';
import { getResourceList, getResourceConfig } from '../../api/kubernetes';
import type { V1CronJob } from '@kubernetes/client-node';

export const CronJobAdapter: ResourceAdapter<V1CronJob> = {
  kinds: ['CronJob', 'CronJobs'],

  adapt(resource, namespace): ResourceSections {
    const spec = resource.spec;
    const status = resource.status;
    const metadata = resource.metadata;

    if (!spec) {
      return { sections: [] };
    }

    const isSuspended = spec.suspend ?? false;
    const schedule = spec.schedule;
    const lastScheduleTime = status?.lastScheduleTime ? new Date(status.lastScheduleTime) : null;
    const lastSuccessfulTime = status?.lastSuccessfulTime ? new Date(status.lastSuccessfulTime) : null;
    const activeJobs = status?.active?.length ?? 0;

    // Parse cron schedule for display
    const scheduleDescription = parseCronSchedule(schedule);

    return {
      sections: [
        // Status overview
        {
          id: 'status',
          data: {
            type: 'status-cards',
            items: [
              { 
                label: 'Status', 
                value: isSuspended ? 'Suspended' : 'Active', 
                status: isSuspended ? 'warning' : 'success',
                icon: isSuspended ? <Pause size={14} /> : <Play size={14} />,
              },
              { 
                label: 'Active Jobs', 
                value: String(activeJobs), 
                status: activeJobs > 0 ? 'warning' : 'neutral',
                icon: <Clock size={14} className="text-blue-400" />,
              },
            ],
          },
        },
        // Schedule
        {
          id: 'schedule',
          data: {
            type: 'schedule',
            schedule,
            description: scheduleDescription,
          },
        },

        // Timing info
        {
          id: 'timing',
          data: {
            type: 'info-grid',
            items: [
              ...(lastScheduleTime ? [
                { label: 'Last Scheduled', value: formatTimeAgo(lastScheduleTime), color: 'text-purple-400' },
              ] : []),
              ...(lastSuccessfulTime ? [
                { label: 'Last Successful', value: formatTimeAgo(lastSuccessfulTime), color: 'text-emerald-400' },
              ] : []),
            ],
            columns: 2 as const,
          },
        },

        // Job configuration
        {
          id: 'job-config',
          title: 'Job Configuration',
          data: {
            type: 'info-grid',
            items: [
              { label: 'Concurrency Policy', value: spec.concurrencyPolicy || 'Allow', color: getConcurrencyColor(spec.concurrencyPolicy) },
              ...(spec.startingDeadlineSeconds ? [
                { label: 'Starting Deadline', value: `${spec.startingDeadlineSeconds}s` },
              ] : []),
              { label: 'Successful History', value: spec.successfulJobsHistoryLimit ?? 3 },
              { label: 'Failed History', value: spec.failedJobsHistoryLimit ?? 1 },
              ...(spec.jobTemplate?.spec?.backoffLimit !== undefined ? [
                { label: 'Backoff Limit', value: spec.jobTemplate.spec.backoffLimit },
              ] : []),
              ...(spec.jobTemplate?.spec?.activeDeadlineSeconds ? [
                { label: 'Job Deadline', value: `${spec.jobTemplate.spec.activeDeadlineSeconds}s`, color: 'text-amber-400' },
              ] : []),
            ],
            columns: 2 as const,
          },
        },

        // Recent Jobs (async loaded)
        {
          id: 'jobs',
          data: {
            type: 'related-jobs',
            title: 'Recent Jobs',
            loader: async (): Promise<JobData[]> => {
              if (!namespace || !metadata?.name) return [];
              
              try {
                const jobConfig = await getResourceConfig('jobs');
                if (!jobConfig) return [];
                
                const jobs = await getResourceList(jobConfig, namespace);
                const cronJobName = metadata.name ?? '';
                const cronJobUid = metadata.uid;
                
                return jobs
                  .filter(job => {
                    const meta = job.metadata as Record<string, unknown>;
                    const jobName = meta.name as string;
                    
                    // Check ownerReferences
                    const refs = meta.ownerReferences as Array<{ name: string; uid: string; kind?: string }> | undefined;
                    if (refs?.some(ref => (ref.kind === 'CronJob' && ref.name === cronJobName) || ref.uid === cronJobUid)) {
                      return true;
                    }
                    
                    // Fallback: match by name prefix (cronjob-name-<timestamp>)
                    if (jobName.startsWith(cronJobName + '-')) {
                      const suffix = jobName.slice(cronJobName.length + 1);
                      return /^\d{10}$/.test(suffix);
                    }
                    
                    return false;
                  })
                  .map(job => {
                    const meta = job.metadata as Record<string, unknown>;
                    const jobStatus = job.status as Record<string, unknown>;
                    const conditions = jobStatus?.conditions as Array<{ type: string; status: string }> | undefined;
                    
                    const isComplete = conditions?.some(c => c.type === 'Complete' && c.status === 'True');
                    const isFailed = conditions?.some(c => c.type === 'Failed' && c.status === 'True');
                    
                    return {
                      name: meta.name as string,
                      status: isComplete ? 'Complete' as const : isFailed ? 'Failed' as const : 'Running' as const,
                      startTime: jobStatus?.startTime as string | undefined,
                      completionTime: jobStatus?.completionTime as string | undefined,
                      succeeded: jobStatus?.succeeded as number | undefined,
                      failed: jobStatus?.failed as number | undefined,
                    };
                  })
                  .sort((a, b) => {
                    // Sort by start time descending
                    const timeA = a.startTime ? new Date(a.startTime).getTime() : 0;
                    const timeB = b.startTime ? new Date(b.startTime).getTime() : 0;
                    return timeB - timeA;
                  });
              } catch (error) {
                console.error('Failed to fetch Jobs:', error);
                return [];
              }
            },
          },
        },

        // Containers
        ...getContainerSections(
          spec.jobTemplate?.spec?.template?.spec?.containers,
          spec.jobTemplate?.spec?.template?.spec?.initContainers,
        ),
      ],
    };
  },
};

// Helper function to get concurrency color
function getConcurrencyColor(policy?: string): string {
  switch (policy) {
    case 'Forbid': return 'text-red-400';
    case 'Replace': return 'text-amber-400';
    case 'Allow':
    default: return 'text-emerald-400';
  }
}
