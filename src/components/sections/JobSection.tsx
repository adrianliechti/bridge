import { HardDrive, Calendar } from 'lucide-react';
import type { VolumeClaimTemplateData } from '../adapters/types';

export function VolumeClaimTemplatesSection({ items }: { items: VolumeClaimTemplateData[] }) {
  return (
    <div className="space-y-2">
      {items.map((template, i) => (
        <div key={i} className="bg-neutral-900/50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <HardDrive size={14} className="text-purple-400" />
            <span className="text-sm text-neutral-100">{template.name}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {template.size && (
              <div>
                <span className="text-neutral-500">Size:</span>{' '}
                <span className="text-cyan-400">{template.size}</span>
              </div>
            )}
            {template.storageClass && (
              <div>
                <span className="text-neutral-500">Class:</span>{' '}
                <span className="text-purple-400">{template.storageClass}</span>
              </div>
            )}
            {template.accessModes && (
              <div className="col-span-2">
                <span className="text-neutral-500">Access:</span>{' '}
                <span className="text-neutral-300">{template.accessModes.join(', ')}</span>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ScheduleSection({ schedule, description }: { schedule: string; description: string }) {
  return (
    <div className="bg-neutral-900/50 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-2">
        <Calendar size={16} className="text-purple-400" />
        <span className="text-sm text-neutral-100">Schedule</span>
      </div>
      <div className="font-mono text-cyan-400 text-lg mb-1">{schedule}</div>
      <div className="text-xs text-neutral-500">{description}</div>
    </div>
  );
}

export function JobProgressSection({ completions, succeeded, failed, active }: { completions: number; succeeded: number; failed: number; active: number }) {
  return (
    <div className="bg-neutral-900/50 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-neutral-300">Completions</span>
        <span className="text-sm">
          <span className={succeeded >= completions ? 'text-emerald-400' : 'text-cyan-400'}>{succeeded}</span>
          <span className="text-neutral-500"> / {completions}</span>
        </span>
      </div>
      <div className="h-2 bg-neutral-700 rounded-full overflow-hidden flex">
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
          <span className="text-neutral-400">Succeeded: {succeeded}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-amber-500" />
          <span className="text-neutral-400">Active: {active}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-red-500" />
          <span className="text-neutral-400">Failed: {failed}</span>
        </div>
      </div>
    </div>
  );
}

export function TimelineSection({ startTime, completionTime }: { startTime?: Date; completionTime?: Date }) {
  return (
    <div className="bg-neutral-900/50 rounded-lg p-3 space-y-2 text-xs">
      {startTime && (
        <div>
          <span className="text-neutral-500">Started:</span>{' '}
          <span className="text-purple-400">{startTime.toLocaleString()}</span>
        </div>
      )}
      {completionTime && (
        <div>
          <span className="text-neutral-500">Completed:</span>{' '}
          <span className="text-emerald-400">{completionTime.toLocaleString()}</span>
        </div>
      )}
    </div>
  );
}
