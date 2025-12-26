import type { CapacityBarData, TaintData } from '../adapters/types';

export function CapacityBarsSection({ items }: { items: CapacityBarData[] }) {
  if (items.length === 0) return null;
  
  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i} className="bg-neutral-100 dark:bg-neutral-900/50 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-sm text-neutral-900 dark:text-neutral-300">
              {item.icon}
              {item.label}
            </div>
            <div className="text-xs">
              <span className="text-cyan-400">{item.allocatable}</span>
              <span className="text-neutral-500"> / </span>
              <span className="text-neutral-400">{item.capacity}</span>
            </div>
          </div>
          <div className="text-[10px] text-neutral-500 flex justify-between">
            <span>Allocatable</span>
            <span>Capacity</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function TaintsSection({ items }: { items: TaintData[] }) {
  if (items.length === 0) return null;
  
  const effectColors: Record<string, string> = {
    'NoSchedule': 'bg-red-500/20 text-red-400 border-red-500/30',
    'PreferNoSchedule': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    'NoExecute': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  };

  return (
    <div className="flex flex-wrap gap-1">
      {items.map((taint, i) => (
        <span 
          key={i} 
          className="text-xs bg-neutral-200 dark:bg-neutral-700 px-2 py-0.5 rounded flex items-center gap-1"
          title={`${taint.key}=${taint.value || ''}:${taint.effect}`}
        >
          <span className="text-purple-600 dark:text-purple-400">{taint.key}</span>
          {taint.value && (
            <>
              <span className="text-neutral-400">=</span>
              <span className="text-cyan-600 dark:text-cyan-400">{taint.value}</span>
            </>
          )}
          <span className={`ml-1 px-1 py-0.5 rounded text-[10px] border ${effectColors[taint.effect] ?? 'bg-neutral-700 text-neutral-300'}`}>
            {taint.effect}
          </span>
        </span>
      ))}
    </div>
  );
}

export function NodeSelectorSection({ selector }: { selector: Record<string, string> }) {
  return (
    <div className="space-y-1">
      {Object.entries(selector).map(([key, value]) => (
        <div key={key} className="text-xs bg-neutral-900/50 px-2 py-1.5 rounded">
          <span className="text-purple-400">{key}</span>
          <span className="text-neutral-600 mx-1">=</span>
          <span className="text-cyan-400">{value}</span>
        </div>
      ))}
    </div>
  );
}
