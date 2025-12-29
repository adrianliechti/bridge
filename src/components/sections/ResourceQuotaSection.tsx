// Resource Quota Section
// Displays aggregated CPU and Memory requests/limits

import { Cpu, HardDrive } from 'lucide-react';
import type { ResourceQuotaData } from '../adapters/types';

interface ResourceQuotaSectionProps {
  data: ResourceQuotaData;
}

export function ResourceQuotaSection({ data }: ResourceQuotaSectionProps) {
  const { cpu, memory } = data;

  // Don't render if no quota data
  const hasData = cpu.requests || cpu.limits || memory.requests || memory.limits;
  if (!hasData) {
    return null;
  }

  return (
    <div>
      <h5 className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2">
        Resource Quota
      </h5>
      <div className="grid grid-cols-2 gap-3">
        {/* CPU */}
        <div className="bg-neutral-100 dark:bg-neutral-800 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <Cpu size={14} className="text-blue-400" />
            <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">CPU</span>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-500">Requests</span>
              <span className="text-sm font-mono text-neutral-900 dark:text-neutral-100">
                {cpu.requests || '—'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-500">Limits</span>
              <span className="text-sm font-mono text-neutral-900 dark:text-neutral-100">
                {cpu.limits || '—'}
              </span>
            </div>
          </div>
        </div>

        {/* Memory */}
        <div className="bg-neutral-100 dark:bg-neutral-800 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <HardDrive size={14} className="text-purple-400" />
            <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">Memory</span>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-500">Requests</span>
              <span className="text-sm font-mono text-neutral-900 dark:text-neutral-100">
                {memory.requests || '—'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-500">Limits</span>
              <span className="text-sm font-mono text-neutral-900 dark:text-neutral-100">
                {memory.limits || '—'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
