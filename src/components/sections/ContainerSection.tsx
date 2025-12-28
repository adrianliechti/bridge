import { useState, useEffect } from 'react';
import { 
  Box, 
  HardDrive, 
  Cpu,
} from 'lucide-react';
import type { ContainerData } from '../adapters/types';

// Get container state styling info
function getContainerStateInfo(state?: string, reason?: string) {
  if (state === 'running') {
    return {
      label: 'Running',
      borderClass: 'border-emerald-500/30 bg-emerald-500/5',
      badgeClass: 'bg-emerald-500/20 text-emerald-400',
      iconClass: 'text-emerald-400',
    };
  }
  if (state === 'waiting') {
    const isError = reason === 'CrashLoopBackOff' || reason === 'Error';
    return {
      label: reason || 'Waiting',
      borderClass: isError ? 'border-red-500/30 bg-red-500/5' : 'border-amber-500/30 bg-amber-500/5',
      badgeClass: isError ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400',
      iconClass: isError ? 'text-red-400' : 'text-amber-400',
    };
  }
  if (state === 'terminated') {
    return {
      label: reason || 'Terminated',
      borderClass: 'border-neutral-300 bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900/50',
      badgeClass: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-400',
      iconClass: 'text-neutral-500 dark:text-neutral-400',
    };
  }
  return {
    label: 'Unknown',
    borderClass: 'border-neutral-300 bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900/50',
    badgeClass: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-400',
    iconClass: 'text-neutral-500 dark:text-neutral-400',
  };
}

const METRICS_REFRESH_INTERVAL = 15000;

type ContainerMetrics = { cpu: { usage: string; usageNanoCores: number }; memory: { usage: string; usageBytes: number } };
type MetricsMap = Map<string, ContainerMetrics>;

export function ContainersSection({ 
  items, 
  metricsLoader 
}: { 
  items: ContainerData[];
  metricsLoader?: () => Promise<MetricsMap | null>;
}) {
  const [metricsMap, setMetricsMap] = useState<MetricsMap | null>(null);

  useEffect(() => {
    if (!metricsLoader) return;
    
    let mounted = true;
    
    const fetchMetrics = async () => {
      const data = await metricsLoader();
      if (mounted) {
        setMetricsMap(data);
      }
    };
    
    fetchMetrics();
    const interval = setInterval(fetchMetrics, METRICS_REFRESH_INTERVAL);
    
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [metricsLoader]);

  if (items.length === 0) return null;
  
  return (
    <div className="space-y-2">
      {items.map((container) => (
        <ContainerCard 
          key={container.name} 
          container={container}
          metrics={metricsMap?.get(container.name)}
        />
      ))}
    </div>
  );
}

export function ContainerCard({ 
  container, 
  metrics,
}: { 
  container: ContainerData;
  metrics?: ContainerMetrics;
}) {
  const [expanded, setExpanded] = useState(false);

  const stateInfo = getContainerStateInfo(container.state, container.stateReason);

  return (
    <div className={`border rounded-lg overflow-hidden ${stateInfo.borderClass}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-neutral-200/50 dark:hover:bg-neutral-800/30 transition-colors cursor-pointer"
      >
        <Box size={16} className={stateInfo.iconClass} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{container.name}</span>
            {container.state && (
              <span className={`px-1.5 py-0.5 rounded text-xs ${stateInfo.badgeClass}`}>
                {stateInfo.label}
              </span>
            )}
          </div>
          <div className="text-xs text-neutral-600 dark:text-neutral-500 truncate">{container.image}</div>
        </div>
        {/* Compact metrics display in header */}
        {metrics && (
          <div className="flex items-center gap-3 text-xs font-mono">
            <span className="text-blue-400" title="CPU">{metrics.cpu.usage}</span>
            <span className="text-purple-400" title="Memory">{metrics.memory.usage}</span>
          </div>
        )}
        {(container.restartCount ?? 0) > 0 && (
          <div className="text-xs text-amber-400">
            {container.restartCount} restarts
          </div>
        )}
      </button>

      {expanded && (
        <div className="border-t border-neutral-200 dark:border-neutral-800 p-3 space-y-3">
          {/* Image */}
          <div>
            <div className="text-xs text-neutral-600 dark:text-neutral-500 mb-1">Image</div>
            <div className="text-xs text-cyan-600 dark:text-cyan-400 break-all">{container.image}</div>
          </div>

          {/* Command & Args */}
          {(container.command || container.args) && (
            <div>
              <div className="text-xs text-neutral-600 dark:text-neutral-500 mb-1">Command</div>
              <code className="text-xs text-neutral-900 dark:text-neutral-300 bg-neutral-200 dark:bg-neutral-800 px-2 py-1 rounded block">
                {[...(container.command || []), ...(container.args || [])].join(' ')}
              </code>
            </div>
          )}

          {/* Ports */}
          {container.ports && container.ports.length > 0 && (
            <div>
              <div className="text-xs text-neutral-600 dark:text-neutral-500 mb-1">Ports</div>
              <div className="flex flex-wrap gap-1">
                {container.ports.map((port, i) => (
                  <span key={i} className="text-xs text-neutral-900 dark:text-neutral-100 bg-neutral-200 dark:bg-neutral-800 px-2 py-1 rounded">
                    {port.containerPort}/{port.protocol || 'TCP'}
                    {port.name && <span className="text-neutral-600 dark:text-neutral-500 ml-1">({port.name})</span>}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Resources (only show if no live metrics) */}
          {!metrics && container.resources && (
            <div className="grid grid-cols-2 gap-2">
              {container.resources.requests && (
                <div>
                  <div className="text-xs text-neutral-600 dark:text-neutral-500 mb-1 flex items-center gap-1">
                    <Cpu size={10} /> Requests
                  </div>
                  <div className="text-xs space-y-0.5">
                    {Object.entries(container.resources.requests).map(([k, v]) => (
                      <div key={k} className="text-neutral-700 dark:text-neutral-400">
                        <span className="text-neutral-600 dark:text-neutral-500">{k}:</span> {v}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {container.resources.limits && (
                <div>
                  <div className="text-xs text-neutral-600 dark:text-neutral-500 mb-1 flex items-center gap-1">
                    <HardDrive size={10} /> Limits
                  </div>
                  <div className="text-xs space-y-0.5">
                    {Object.entries(container.resources.limits).map(([k, v]) => (
                      <div key={k} className="text-neutral-700 dark:text-neutral-400">
                        <span className="text-neutral-600 dark:text-neutral-500">{k}:</span> {v}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Volume Mounts */}
          {container.mounts && container.mounts.length > 0 && (
            <div>
              <div className="text-xs text-neutral-500 mb-2 flex items-center gap-1">
                <HardDrive size={10} /> Volume Mounts
              </div>
              <div className="text-xs space-y-1.5">
                {container.mounts.map((mount, i) => (
                  <div key={i} className="bg-neutral-100 dark:bg-neutral-900/50 rounded p-2 flex items-center gap-2">
                    <span className="text-purple-400 truncate max-w-35" title={mount.name}>{mount.name}</span>
                    <span className="text-neutral-600">→</span>
                    <span className="text-cyan-400 font-mono truncate flex-1" title={mount.mountPath}>{mount.mountPath}</span>
                    {mount.readOnly && <span className="text-amber-400 text-[10px] px-1 py-0.5 bg-amber-500/10 rounded">(ro)</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

