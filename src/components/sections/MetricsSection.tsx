import { useState, useEffect } from 'react';
import { 
  Box, 
  HardDrive, 
  Cpu, 
  ChevronDown,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import type { 
  ContainerMetricsData,
  WorkloadMetricsData,
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

export function ContainerMetricsSection({ loader, title }: { loader: () => Promise<ContainerMetricsData[] | null>; title?: string }) {
  const [items, setItems] = useState<ContainerMetricsData[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    
    const fetchMetrics = async () => {
      const data = await loader();
      if (mounted) {
        setItems(data);
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
  if (!loading && items === null) {
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

  if (!items || items.length === 0) {
    return null;
  }

  return (
    <div>
      {title && <h5 className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2">{title}</h5>}
      <div className="space-y-3">
      {items.map((container) => (
        <div key={container.name} className="bg-neutral-100 dark:bg-neutral-900/50 rounded-lg p-3 space-y-3">
          <div className="flex items-center gap-2">
            <Box size={14} className="text-blue-400" />
            <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{container.name}</span>
          </div>
          
          {/* CPU */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-neutral-600 dark:text-neutral-400 flex items-center gap-1.5">
                <Cpu size={12} />
                CPU
              </span>
              <span className="text-neutral-900 dark:text-neutral-100 font-mono">{container.cpu.usage}</span>
            </div>
            {(container.cpu.requestNanoCores || container.cpu.limitNanoCores) && (
              <div className="flex items-center gap-2">
                {container.cpu.requestNanoCores && (
                  <MetricsProgressBar 
                    value={container.cpu.usageNanoCores} 
                    max={container.cpu.requestNanoCores}
                    label={`of ${container.cpu.request} request`}
                    colorClass="bg-blue-500"
                  />
                )}
                {container.cpu.limitNanoCores && (
                  <MetricsProgressBar 
                    value={container.cpu.usageNanoCores} 
                    max={container.cpu.limitNanoCores}
                    label={`of ${container.cpu.limit} limit`}
                    colorClass="bg-cyan-500"
                  />
                )}
              </div>
            )}
          </div>
          
          {/* Memory */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-neutral-600 dark:text-neutral-400 flex items-center gap-1.5">
                <HardDrive size={12} />
                Memory
              </span>
              <span className="text-neutral-900 dark:text-neutral-100 font-mono">{container.memory.usage}</span>
            </div>
            {(container.memory.requestBytes || container.memory.limitBytes) && (
              <div className="flex items-center gap-2">
                {container.memory.requestBytes && (
                  <MetricsProgressBar 
                    value={container.memory.usageBytes} 
                    max={container.memory.requestBytes}
                    label={`of ${container.memory.request} request`}
                    colorClass="bg-purple-500"
                  />
                )}
                {container.memory.limitBytes && (
                  <MetricsProgressBar 
                    value={container.memory.usageBytes} 
                    max={container.memory.limitBytes}
                    label={`of ${container.memory.limit} limit`}
                    colorClass="bg-pink-500"
                  />
                )}
              </div>
            )}
          </div>
        </div>
      ))}
      </div>
    </div>
  );
}

export function WorkloadMetricsSection({ loader, title }: { loader: () => Promise<WorkloadMetricsData | null>; title?: string }) {
  const [data, setData] = useState<WorkloadMetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

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

  return (
    <div>
      {title && <h5 className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2">{title}</h5>}
      <div className="space-y-3">
        {/* Totals */}
        <div className="grid grid-cols-2 gap-3">
        <div className="bg-neutral-100 dark:bg-neutral-900/50 rounded-lg p-3">
          <div className="text-xs text-neutral-600 dark:text-neutral-500 flex items-center gap-1.5 mb-1">
            <Cpu size={12} />
            Total CPU
          </div>
          <div className="text-lg font-mono text-blue-600 dark:text-blue-400">{data.totalCpu}</div>
        </div>
        <div className="bg-neutral-100 dark:bg-neutral-900/50 rounded-lg p-3">
          <div className="text-xs text-neutral-600 dark:text-neutral-500 flex items-center gap-1.5 mb-1">
            <HardDrive size={12} />
            Total Memory
          </div>
          <div className="text-lg font-mono text-purple-600 dark:text-purple-400">{data.totalMemory}</div>
        </div>
      </div>
      
      {/* Per-pod breakdown (collapsible) */}
      {data.podMetrics.length > 0 && (
        <div className="border border-neutral-300 dark:border-neutral-700 rounded-lg overflow-hidden">
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-between p-2 bg-neutral-200/50 dark:bg-neutral-800/50 hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors"
          >
            <span className="text-xs text-neutral-700 dark:text-neutral-400">
              {data.podMetrics.length} pod{data.podMetrics.length !== 1 ? 's' : ''}
            </span>
            {expanded ? (
              <ChevronDown size={14} className="text-neutral-500" />
            ) : (
              <ChevronRight size={14} className="text-neutral-500" />
            )}
          </button>
          
          {expanded && (
            <div className="divide-y divide-neutral-800">
              {data.podMetrics.map((pod) => (
                <div key={pod.name} className="p-2 flex items-center justify-between">
                  <span className="text-xs text-neutral-300 truncate max-w-50" title={pod.name}>
                    {pod.name}
                  </span>
                  <div className="flex items-center gap-3 text-xs font-mono">
                    <span className="text-blue-400">{pod.cpu}</span>
                    <span className="text-purple-400">{pod.memory}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      </div>
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
