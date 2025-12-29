import { useState, useEffect } from 'react';
import { 
  HardDrive, 
  Cpu, 
  RefreshCw,
} from 'lucide-react';
import type { 
  NodeMetricsData,
} from '../adapters/types';
import { calculatePercentage } from '../../api/kubernetesMetrics';

const METRICS_REFRESH_INTERVAL = 15000; // 15 seconds

/** Progress bar component for metrics */
export function MetricsProgressBar({ 
  value, 
  max, 
  label,
  colorClass = 'bg-blue-500',
}: { 
  value: number; 
  max: number; 
  label?: string;
  colorClass?: string;
}) {
  const percentage = calculatePercentage(value, max);
  const isHigh = percentage > 80;
  const barColor = isHigh ? 'bg-amber-500' : colorClass;
  
  return (
    <div className="flex-1">
      <div className="h-2 bg-neutral-300 dark:bg-neutral-700 rounded-full overflow-hidden">
        <div 
          className={`h-full ${barColor} transition-all duration-300`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {label && (
        <div className="text-xs text-neutral-600 dark:text-neutral-500 mt-0.5">{label}</div>
      )}
    </div>
  );
}

export function NodeMetricsSection({ loader, title }: { loader: () => Promise<NodeMetricsData | null>; title?: string }) {
  const [data, setData] = useState<NodeMetricsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    
    const fetchMetrics = async () => {
      const result = await loader();
      if (mounted) {
        setData(result);
        setLoading(false);
      }
    };
    
    fetchMetrics();
    const interval = setInterval(fetchMetrics, METRICS_REFRESH_INTERVAL);
    
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [loader]);

  // Hide section if no metrics available
  if (!loading && data === null) {
    return null;
  }

  if (loading) {
    return (
      <div>
        {title && <h5 className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2">{title}</h5>}
        <div className="flex items-center gap-2 text-xs text-neutral-500">
          <RefreshCw size={12} className="animate-spin" />
          Loading metrics...
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const cpuPercentage = calculatePercentage(data.cpu.usageNanoCores, data.cpu.allocatableNanoCores);
  const memoryPercentage = calculatePercentage(data.memory.usageBytes, data.memory.allocatableBytes);

  return (
    <div>
      {title && <h5 className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2">{title}</h5>}
      <div className="space-y-3">
        {/* CPU Usage */}
        <div className="bg-neutral-900/50 rounded-lg p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-neutral-400 flex items-center gap-1.5">
            <Cpu size={12} />
            CPU Usage
          </span>
          <span className="text-xs font-mono">
            <span className={cpuPercentage > 80 ? 'text-amber-400' : 'text-blue-400'}>{data.cpu.usage}</span>
            <span className="text-neutral-500"> / {data.cpu.allocatable}</span>
          </span>
        </div>
        <div className="h-2 bg-neutral-700 rounded-full overflow-hidden">
          <div 
            className={`h-full transition-all duration-300 ${cpuPercentage > 80 ? 'bg-amber-500' : 'bg-blue-500'}`}
            style={{ width: `${cpuPercentage}%` }}
          />
        </div>
        <div className="text-xs text-neutral-500 text-right">{cpuPercentage}% utilized</div>
      </div>
      
      {/* Memory Usage */}
      <div className="bg-neutral-900/50 rounded-lg p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-neutral-400 flex items-center gap-1.5">
            <HardDrive size={12} />
            Memory Usage
          </span>
          <span className="text-xs font-mono">
            <span className={memoryPercentage > 80 ? 'text-amber-400' : 'text-purple-400'}>{data.memory.usage}</span>
            <span className="text-neutral-500"> / {data.memory.allocatable}</span>
          </span>
        </div>
        <div className="h-2 bg-neutral-700 rounded-full overflow-hidden">
          <div 
            className={`h-full transition-all duration-300 ${memoryPercentage > 80 ? 'bg-amber-500' : 'bg-purple-500'}`}
            style={{ width: `${memoryPercentage}%` }}
          />
        </div>
        <div className="text-xs text-neutral-500 text-right">{memoryPercentage}% utilized</div>
        </div>
      </div>
    </div>
  );
}
