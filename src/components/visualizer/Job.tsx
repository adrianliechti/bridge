import { useMemo, useState, useEffect } from 'react';
import { Play, CheckCircle2, XCircle, Clock, Box } from 'lucide-react';
import { registerVisualizer, type ResourceVisualizerProps } from './Visualizer';
import { StatusCard, ConditionsSection } from './shared';
import { formatDuration } from './utils';
import type { V1Job, V1JobCondition } from '@kubernetes/client-node';

export function JobVisualizer({ resource }: ResourceVisualizerProps) {
  const job = resource as unknown as V1Job;
  const spec = job.spec;
  const status = job.status;

  // Memoize timestamps to avoid recreating Date objects on every render
  // All hooks must be called before any early returns
  const startTime = useMemo(
    () => (status?.startTime ? new Date(status.startTime) : null),
    [status]
  );
  const completionTime = useMemo(
    () => (status?.completionTime ? new Date(status.completionTime) : null),
    [status]
  );

  // Track current time in state for running jobs
  const [now, setNow] = useState(() => Date.now());
  const isRunning = startTime && !completionTime;

  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [isRunning]);

  // Calculate duration
  const duration = useMemo(() => {
    if (!startTime) return null;
    if (completionTime) {
      return formatDuration(completionTime.getTime() - startTime.getTime());
    }
    return formatDuration(now - startTime.getTime()) + ' (running)';
  }, [startTime, completionTime, now]);

  if (!spec) {
    return <div className="text-gray-500 text-sm">No job spec available</div>;
  }

  const completions = spec.completions ?? 1;
  const parallelism = spec.parallelism ?? 1;
  const succeeded = status?.succeeded ?? 0;
  const failed = status?.failed ?? 0;
  const active = status?.active ?? 0;
  const backoffLimit = spec.backoffLimit ?? 6;

  // Determine job status
  const isComplete = succeeded >= completions;
  const isFailed = status?.conditions?.some(c => c.type === 'Failed' && c.status === 'True');
  const jobStatus = isComplete ? 'Complete' : isFailed ? 'Failed' : active > 0 ? 'Running' : 'Pending';

  return (
    <div className="space-y-4">
      {/* Job Status Overview */}
      <div className="grid grid-cols-2 gap-3">
        <StatusCard 
          label="Status" 
          value={jobStatus} 
          status={isComplete ? 'success' : isFailed ? 'error' : active > 0 ? 'warning' : 'neutral'}
          icon={isComplete ? <CheckCircle2 size={14} /> : isFailed ? <XCircle size={14} /> : <Play size={14} />}
        />
        {duration && (
          <StatusCard 
            label="Duration" 
            value={duration} 
            icon={<Clock size={14} className="text-blue-400" />}
          />
        )}
      </div>

      {/* Progress */}
      <div>
        <h5 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
          Progress
        </h5>
        <div className="bg-gray-900/50 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-300">Completions</span>
            <span className="text-sm">
              <span className={succeeded >= completions ? 'text-emerald-400' : 'text-cyan-400'}>{succeeded}</span>
              <span className="text-gray-500"> / {completions}</span>
            </span>
          </div>
          <div className="h-2 bg-gray-700 rounded-full overflow-hidden flex">
            {succeeded > 0 && (
              <div 
                className="h-full bg-emerald-500"
                style={{ width: `${(succeeded / completions) * 100}%` }}
              />
            )}
            {failed > 0 && (
              <div 
                className="h-full bg-red-500"
                style={{ width: `${(failed / (completions + failed)) * 100}%` }}
              />
            )}
          </div>
          
          {/* Pod Status Indicators */}
          <div className="flex items-center gap-4 mt-3 text-xs">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-gray-400">Succeeded: {succeeded}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-amber-500" />
              <span className="text-gray-400">Active: {active}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-gray-400">Failed: {failed}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Job Configuration */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-900/50 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">Parallelism</div>
          <div className="text-sm text-cyan-400">{parallelism}</div>
        </div>
        <div className="bg-gray-900/50 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">Backoff Limit</div>
          <div className="text-sm text-gray-100">
            {backoffLimit}
            {failed > 0 && (
              <span className={`ml-2 text-xs ${failed >= backoffLimit ? 'text-red-400' : 'text-amber-400'}`}>
                ({failed} failures)
              </span>
            )}
          </div>
        </div>
        {spec.activeDeadlineSeconds && (
          <div className="bg-gray-900/50 rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-1">Deadline</div>
            <div className="text-sm text-amber-400">{spec.activeDeadlineSeconds}s</div>
          </div>
        )}
        {spec.ttlSecondsAfterFinished !== undefined && (
          <div className="bg-gray-900/50 rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-1">TTL After Finished</div>
            <div className="text-sm text-gray-100">{spec.ttlSecondsAfterFinished}s</div>
          </div>
        )}
      </div>

      {/* Completion Mode */}
      {spec.completionMode && (
        <div className="bg-gray-900/50 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">Completion Mode</div>
          <div className="text-sm text-purple-400">{spec.completionMode}</div>
        </div>
      )}

      {/* Conditions */}
      {status?.conditions && status.conditions.length > 0 && (
        <ConditionsSection 
          conditions={status.conditions}
          defaultOpen={true}
          isPositive={isJobConditionPositive}
        />
      )}

      {/* Timestamps */}
      <div>
        <h5 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
          Timeline
        </h5>
        <div className="bg-gray-900/50 rounded-lg p-3 space-y-2 text-xs">
          {startTime && (
            <div>
              <span className="text-gray-500">Started:</span>{' '}
              <span className="text-purple-400">{startTime.toLocaleString()}</span>
            </div>
          )}
          {completionTime && (
            <div>
              <span className="text-gray-500">Completed:</span>{' '}
              <span className="text-emerald-400">{completionTime.toLocaleString()}</span>
            </div>
          )}
        </div>
      </div>

      {/* Container Images */}
      {spec.template?.spec?.containers && (
        <div>
          <h5 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
            Container Images
          </h5>
          <div className="space-y-1">
            {spec.template.spec.containers.map(container => (
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
registerVisualizer('Job', JobVisualizer);
registerVisualizer('Jobs', JobVisualizer);

// Helper function to determine if a job condition is positive
function isJobConditionPositive(condition: V1JobCondition): boolean {
  // Complete + True is good, Failed + True is bad
  if (condition.type === 'Complete') return condition.status === 'True';
  if (condition.type === 'Failed') return condition.status !== 'True';
  return condition.status === 'True';
}
