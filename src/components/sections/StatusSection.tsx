import { 
  Box, 
  Database, 
  Server,
} from 'lucide-react';
import type { 
  StatusCardData,
  GaugeData,
  PodGridData,
} from './types';

export function StatusCardsSection({ items }: { items: StatusCardData[] }) {
  const statusColors = {
    success: 'text-emerald-400',
    warning: 'text-amber-400',
    error: 'text-red-400',
    neutral: 'text-neutral-900 dark:text-neutral-100',
  };

  return (
    <div className="grid grid-cols-2 gap-3">
      {items.map((item, i) => (
        <div key={i} className="bg-neutral-100 dark:bg-neutral-800 rounded-lg p-3">
          <div className="text-xs text-neutral-500 mb-1">{item.label}</div>
          <div className={`text-sm font-medium flex items-center gap-2 ${statusColors[item.status || 'neutral']}`}>
            {item.icon}
            {item.value}
          </div>
          {item.description && (
            <div className="text-xs text-neutral-500 mt-1">{item.description}</div>
          )}
        </div>
      ))}
    </div>
  );
}

export function GaugesSection({ items, podGrid }: { items: GaugeData[]; podGrid?: PodGridData }) {
  const colorClasses: Record<string, string> = {
    emerald: 'text-emerald-400',
    blue: 'text-blue-400',
    cyan: 'text-cyan-400',
    purple: 'text-purple-400',
    amber: 'text-amber-400',
  };
  const bgClasses: Record<string, string> = {
    emerald: 'bg-emerald-500',
    blue: 'bg-blue-500',
    cyan: 'bg-cyan-500',
    purple: 'bg-purple-500',
    amber: 'bg-amber-500',
  };

  return (
    <div className="bg-neutral-100 dark:bg-neutral-800 rounded-lg p-3">
      <div className="flex items-center gap-4 mb-3">
        {items.map((item, i) => {
          const percentage = item.total > 0 ? Math.min((item.current / item.total) * 100, 100) : 0;
          return (
            <div key={i} className="flex-1">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-neutral-600 dark:text-neutral-500">{item.label}</span>
                <span className={colorClasses[item.color]}>{item.current}/{item.total}</span>
              </div>
              <div className="h-1 bg-neutral-300 dark:bg-neutral-700 rounded-full overflow-hidden">
                <div className={`h-full ${bgClasses[item.color]}`} style={{ width: `${percentage}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      {podGrid && <PodGridSection data={podGrid} />}
    </div>
  );
}

export function PodGridSection({ data }: { data: PodGridData }) {
  const IconComponent = data.icon === 'database' ? Database : data.icon === 'server' ? Server : Box;

  return (
    <div className="flex flex-wrap gap-1">
      {Array.from({ length: data.total }).map((_, i) => {
        const isReady = i < data.ready;
        const isAvailable = data.available !== undefined ? i < data.available : isReady;
        const isCurrent = data.current !== undefined ? i < data.current : isAvailable;
        const title = data.podTitles?.[i] ?? `Pod ${i}`;

        return (
          <div
            key={i}
            className={`${data.showOrdinal ? 'w-8 h-8' : 'w-6 h-6'} rounded flex flex-col items-center justify-center ${
              isReady ? 'bg-emerald-500/20 border border-emerald-500/50' :
              isAvailable ? 'bg-cyan-500/20 border border-cyan-500/50' :
              isCurrent ? 'bg-amber-500/20 border border-amber-500/50' :
              'bg-neutral-300/50 dark:bg-neutral-700/50 border border-neutral-400 dark:border-neutral-600'
            }`}
            title={`${title}: ${isReady ? 'Ready' : isAvailable ? 'Available' : isCurrent ? 'Current' : 'Pending'}`}
          >
            <IconComponent size={data.showOrdinal ? 10 : 12} className={
              isReady ? 'text-emerald-600 dark:text-emerald-400' :
              isAvailable ? 'text-cyan-600 dark:text-cyan-400' :
              isCurrent ? 'text-amber-600 dark:text-amber-400' :
              'text-neutral-600 dark:text-neutral-500'
            } />
            {data.showOrdinal && (
              <span className={`text-[9px] ${
                isReady ? 'text-emerald-600 dark:text-emerald-400' :
                isAvailable ? 'text-cyan-600 dark:text-cyan-400' :
                isCurrent ? 'text-amber-600 dark:text-amber-400' :
                'text-neutral-600 dark:text-neutral-500'
              }`}>{i}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

