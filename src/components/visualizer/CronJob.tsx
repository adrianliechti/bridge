import { useState, useEffect } from 'react';
import { Calendar, Clock, Play, Pause, CheckCircle2, XCircle, Box, ChevronDown, ChevronRight } from 'lucide-react';
import { registerVisualizer, type ResourceVisualizerProps } from './Visualizer';
import { StatusCard } from './shared';
import { parseCronSchedule, formatTimeAgo } from './utils';
import { getResourceList, getResourceConfig } from '../../api/kubernetes';
import type { V1CronJob } from '@kubernetes/client-node';

interface JobDisplay {
  name: string;
  status: 'Running' | 'Complete' | 'Failed';
  startTime?: string;
  completionTime?: string;
  succeeded?: number;
  failed?: number;
}

export function CronJobVisualizer({ resource, namespace }: ResourceVisualizerProps) {
  const cronJob = resource as unknown as V1CronJob;
  const spec = cronJob.spec;
  const status = cronJob.status;
  const metadata = cronJob.metadata;
  const [jobs, setJobs] = useState<JobDisplay[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);

  // Fetch Jobs owned by this CronJob
  useEffect(() => {
    async function fetchJobs() {
      if (!namespace || !metadata?.name) return;
      
      try {
        const jobConfig = await getResourceConfig('jobs');
        if (!jobConfig) {
          console.warn('Jobs resource config not found');
          return;
        }
        
        const jobs = await getResourceList(jobConfig, namespace);

        // Filter Jobs owned by this CronJob
        const cronJobName = metadata.name ?? '';
        const cronJobUid = metadata.uid;
        
        const ownedJobs = jobs
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

        setJobs(ownedJobs);
      } catch (error) {
        console.error('Failed to fetch Jobs:', error);
      } finally {
        setLoadingJobs(false);
      }
    }

    fetchJobs();
  }, [metadata?.name, metadata?.uid, namespace]);

  if (!spec) {
    return <div className="text-gray-500 text-sm">No cronjob spec available</div>;
  }

  const isSuspended = spec.suspend ?? false;
  const schedule = spec.schedule;
  const lastScheduleTime = status?.lastScheduleTime ? new Date(status.lastScheduleTime) : null;
  const lastSuccessfulTime = status?.lastSuccessfulTime ? new Date(status.lastSuccessfulTime) : null;
  const activeJobs = status?.active?.length ?? 0;

  // Parse cron schedule for display
  const scheduleDescription = parseCronSchedule(schedule);

  return (
    <div className="space-y-4">
      {/* Status Overview */}
      <div className="grid grid-cols-2 gap-3">
        <StatusCard 
          label="Status" 
          value={isSuspended ? 'Suspended' : 'Active'} 
          status={isSuspended ? 'warning' : 'success'}
          icon={isSuspended ? <Pause size={14} /> : <Play size={14} />}
        />
        <StatusCard 
          label="Active Jobs" 
          value={String(activeJobs)} 
          status={activeJobs > 0 ? 'warning' : 'neutral'}
          icon={<Clock size={14} className="text-blue-400" />}
        />
      </div>

      {/* Schedule */}
      <div className="bg-gray-900/50 rounded-lg p-3">
        <div className="flex items-center gap-2 mb-2">
          <Calendar size={16} className="text-purple-400" />
          <span className="text-sm text-gray-100">Schedule</span>
        </div>
        <div className="font-mono text-cyan-400 text-lg mb-1">{schedule}</div>
        <div className="text-xs text-gray-500">{scheduleDescription}</div>
      </div>

      {/* Timing Info */}
      <div className="grid grid-cols-2 gap-3">
        {lastScheduleTime && (
          <div className="bg-gray-900/50 rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-1">Last Scheduled</div>
            <div className="text-sm text-purple-400">{formatTimeAgo(lastScheduleTime)}</div>
            <div className="text-xs text-gray-600">{lastScheduleTime.toLocaleString()}</div>
          </div>
        )}
        {lastSuccessfulTime && (
          <div className="bg-gray-900/50 rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-1">Last Successful</div>
            <div className="text-sm text-emerald-400">{formatTimeAgo(lastSuccessfulTime)}</div>
            <div className="text-xs text-gray-600">{lastSuccessfulTime.toLocaleString()}</div>
          </div>
        )}
      </div>

      {/* Job Configuration */}
      <div>
        <h5 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
          Job Configuration
        </h5>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-900/50 rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-1">Concurrency Policy</div>
            <div className={`text-sm ${getConcurrencyColor(spec.concurrencyPolicy)}`}>
              {spec.concurrencyPolicy || 'Allow'}
            </div>
          </div>
          {spec.startingDeadlineSeconds && (
            <div className="bg-gray-900/50 rounded-lg p-3">
              <div className="text-xs text-gray-500 mb-1">Starting Deadline</div>
              <div className="text-sm text-gray-100">{spec.startingDeadlineSeconds}s</div>
            </div>
          )}
          <div className="bg-gray-900/50 rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-1">Successful History</div>
            <div className="text-sm text-gray-100">{spec.successfulJobsHistoryLimit ?? 3}</div>
          </div>
          <div className="bg-gray-900/50 rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-1">Failed History</div>
            <div className="text-sm text-gray-100">{spec.failedJobsHistoryLimit ?? 1}</div>
          </div>
        </div>
      </div>

      {/* Job Template Info */}
      {spec.jobTemplate?.spec && (
        <div className="grid grid-cols-2 gap-3">
          {spec.jobTemplate.spec.backoffLimit !== undefined && (
            <div className="bg-gray-900/50 rounded-lg p-3">
              <div className="text-xs text-gray-500 mb-1">Backoff Limit</div>
              <div className="text-sm text-gray-100">{spec.jobTemplate.spec.backoffLimit}</div>
            </div>
          )}
          {spec.jobTemplate.spec.activeDeadlineSeconds && (
            <div className="bg-gray-900/50 rounded-lg p-3">
              <div className="text-xs text-gray-500 mb-1">Job Deadline</div>
              <div className="text-sm text-amber-400">{spec.jobTemplate.spec.activeDeadlineSeconds}s</div>
            </div>
          )}
        </div>
      )}

      {/* Recent Jobs */}
      <div>
        <h5 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
          Recent Jobs
        </h5>
        {loadingJobs ? (
          <div className="text-xs text-gray-500">Loading jobs...</div>
        ) : jobs.length === 0 ? (
          <div className="text-xs text-gray-500">No jobs found</div>
        ) : (
          <JobsSection jobs={jobs} />
        )}
      </div>

      {/* Container Images */}
      {spec.jobTemplate?.spec?.template?.spec?.containers && (
        <div>
          <h5 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
            Container Images
          </h5>
          <div className="space-y-1">
            {spec.jobTemplate.spec.template.spec.containers.map(container => (
              <div key={container.name} className="text-xs bg-gray-900/50 px-2 py-1.5 rounded flex items-center gap-2">
                <Box size={12} className="text-blue-400" />
                <span className="text-gray-300">{container.name}:</span>
                <span className="text-cyan-400 truncate">{container.image}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Register this visualizer
registerVisualizer('CronJob', CronJobVisualizer);
registerVisualizer('CronJobs', CronJobVisualizer);

// Helper components

function JobsSection({ jobs }: { jobs: JobDisplay[] }) {
  const [expanded, setExpanded] = useState(true);
  const displayJobs = expanded ? jobs : jobs.slice(0, 3);

  return (
    <div className="space-y-1">
      {displayJobs.map(job => (
        <div 
          key={job.name} 
          className={`flex items-center justify-between text-xs px-2 py-1.5 rounded ${
            job.status === 'Complete' 
              ? 'bg-emerald-500/10 border border-emerald-500/20' 
              : job.status === 'Failed'
              ? 'bg-red-500/10 border border-red-500/20'
              : 'bg-amber-500/10 border border-amber-500/20'
          }`}
        >
          <div className="flex items-center gap-2">
            {job.status === 'Complete' ? (
              <CheckCircle2 size={12} className="text-emerald-400" />
            ) : job.status === 'Failed' ? (
              <XCircle size={12} className="text-red-400" />
            ) : (
              <Clock size={12} className="text-amber-400" />
            )}
            <span className="text-gray-300 truncate max-w-45" title={job.name}>{job.name}</span>
          </div>
          <div className="flex items-center gap-2">
            {job.startTime && (
              <span className="text-gray-500">{formatTimeAgo(new Date(job.startTime))}</span>
            )}
            <span className={
              job.status === 'Complete' ? 'text-emerald-400' :
              job.status === 'Failed' ? 'text-red-400' : 'text-amber-400'
            }>
              {job.status}
            </span>
          </div>
        </div>
      ))}
      {jobs.length > 3 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors mt-2"
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {expanded ? 'Show less' : `Show ${jobs.length - 3} more`}
        </button>
      )}
    </div>
  );
}

// Helper functions

function getConcurrencyColor(policy?: string): string {
  switch (policy) {
    case 'Forbid': return 'text-red-400';
    case 'Replace': return 'text-amber-400';
    case 'Allow':
    default: return 'text-emerald-400';
  }
}
