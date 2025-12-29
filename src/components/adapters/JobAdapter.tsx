// Job Adapter
// Extracts display data from Job resources

import { Play, CheckCircle2, XCircle, Clock } from 'lucide-react';
import type { ResourceAdapter, ResourceSections } from './types';
import type { V1Job } from '@kubernetes/client-node';
import { getContainerSections } from './utils';

export const JobAdapter: ResourceAdapter<V1Job> = {
  kinds: ['Job', 'Jobs'],

  adapt(_context: string, resource): ResourceSections {
    const spec = resource.spec;
    const status = resource.status;

    if (!spec) {
      return { sections: [] };
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

    // Parse timestamps
    const startTime = status?.startTime ? new Date(status.startTime) : undefined;
    const completionTime = status?.completionTime ? new Date(status.completionTime) : undefined;

    return {
      sections: [
        // Job status overview
        {
          id: 'status',
          data: {
            type: 'status-cards',
            items: [
              { 
                label: 'Status', 
                value: jobStatus, 
                status: isComplete ? 'success' : isFailed ? 'error' : active > 0 ? 'warning' : 'neutral',
                icon: isComplete ? <CheckCircle2 size={14} /> : isFailed ? <XCircle size={14} /> : <Play size={14} />,
              },
              ...(startTime ? [{
                label: 'Duration',
                value: getDuration(startTime, completionTime),
                icon: <Clock size={14} className="text-blue-400" />,
              }] : []),
            ],
          },
        },

        // Progress
        {
          id: 'progress',
          title: 'Progress',
          data: {
            type: 'job-progress',
            completions,
            succeeded,
            failed,
            active,
          },
        },

        // Job configuration
        {
          id: 'config',
          data: {
            type: 'info-grid',
            items: [
              { label: 'Parallelism', value: parallelism, color: 'text-cyan-400' },
              { label: 'Backoff Limit', value: `${backoffLimit}${failed > 0 ? ` (${failed} failures)` : ''}`, color: failed >= backoffLimit ? 'text-red-400' : failed > 0 ? 'text-amber-400' : undefined },
              ...(spec.activeDeadlineSeconds ? [
                { label: 'Deadline', value: `${spec.activeDeadlineSeconds}s`, color: 'text-amber-400' },
              ] : []),
              ...(spec.ttlSecondsAfterFinished !== undefined ? [
                { label: 'TTL After Finished', value: `${spec.ttlSecondsAfterFinished}s` },
              ] : []),
              ...(spec.completionMode ? [
                { label: 'Completion Mode', value: spec.completionMode, color: 'text-purple-400' },
              ] : []),
            ],
            columns: 2 as const,
          },
        },

        // Timeline
        ...(startTime ? [{
          id: 'timeline',
          title: 'Timeline',
          data: {
            type: 'timeline' as const,
            startTime,
            completionTime,
          },
        }] : []),

        // Containers
        ...getContainerSections(
          spec.template?.spec?.containers,
          spec.template?.spec?.initContainers,
        ),

        // Conditions
        ...(status?.conditions?.length ? [{
          id: 'conditions',
          data: {
            type: 'conditions' as const,
            items: status.conditions.map(c => ({
              type: c.type || '',
              status: c.status || '',
              reason: c.reason,
              message: c.message,
            })),
          },
        }] : []),
      ],
    };
  },
};

// Helper function to format duration
function getDuration(start: Date, end?: Date): string {
  const endTime = end ?? new Date();
  const ms = endTime.getTime() - start.getTime();
  
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}
