import { Server, Box, AlertTriangle } from 'lucide-react';
import { registerVisualizer, type ResourceVisualizerProps } from './Visualizer';
import { StatusGauge, ConditionsSection } from './shared';
import type { V1DaemonSet } from '@kubernetes/client-node';

export function DaemonSetVisualizer({ resource }: ResourceVisualizerProps) {
  const daemonSet = resource as unknown as V1DaemonSet;
  const spec = daemonSet.spec;
  const status = daemonSet.status;

  if (!spec) {
    return <div className="text-gray-500 text-sm">No daemonset spec available</div>;
  }

  const desiredNumberScheduled = status?.desiredNumberScheduled ?? 0;
  const currentNumberScheduled = status?.currentNumberScheduled ?? 0;
  const numberReady = status?.numberReady ?? 0;
  const numberAvailable = status?.numberAvailable ?? 0;
  const numberMisscheduled = status?.numberMisscheduled ?? 0;
  const updatedNumberScheduled = status?.updatedNumberScheduled ?? 0;

  return (
    <div className="space-y-4">
      {/* Node Distribution Status */}
      <div>
        <h5 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
          Node Distribution
        </h5>
        <div className="bg-gray-900/50 rounded-lg p-3">
          <div className="grid grid-cols-3 gap-3 mb-3">
            <StatusGauge 
              label="Scheduled" 
              current={currentNumberScheduled} 
              total={desiredNumberScheduled}
              color="blue"
            />
            <StatusGauge 
              label="Ready" 
              current={numberReady} 
              total={desiredNumberScheduled}
              color="emerald"
            />
            <StatusGauge 
              label="Available" 
              current={numberAvailable} 
              total={desiredNumberScheduled}
              color="cyan"
            />
          </div>
          
          {/* Visual node pods */}
          <div className="flex flex-wrap gap-1">
            {Array.from({ length: desiredNumberScheduled }).map((_, i) => {
              const isReady = i < numberReady;
              const isScheduled = i < currentNumberScheduled;
              return (
                <div
                  key={i}
                  className={`w-6 h-6 rounded flex items-center justify-center ${
                    isReady ? 'bg-emerald-500/20 border border-emerald-500/50' :
                    isScheduled ? 'bg-amber-500/20 border border-amber-500/50' :
                    'bg-gray-700/50 border border-gray-600'
                  }`}
                  title={isReady ? 'Ready' : isScheduled ? 'Scheduled but not ready' : 'Pending'}
                >
                  <Server size={12} className={
                    isReady ? 'text-emerald-400' :
                    isScheduled ? 'text-amber-400' :
                    'text-gray-500'
                  } />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Status Details */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-900/50 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">Update Strategy</div>
          <div className="text-sm text-gray-100 flex items-center gap-2">
            {spec.updateStrategy?.type || 'RollingUpdate'}
          </div>
        </div>
        <div className="bg-gray-900/50 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">Updated</div>
          <div className="text-sm text-cyan-400">
            {updatedNumberScheduled}/{desiredNumberScheduled}
          </div>
        </div>
        {numberMisscheduled > 0 && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 col-span-2">
            <div className="text-xs text-gray-500 mb-1">Misscheduled</div>
            <div className="text-sm text-red-400 flex items-center gap-2">
              <AlertTriangle size={14} />
              {numberMisscheduled} pods running on wrong nodes
            </div>
          </div>
        )}
      </div>

      {/* Rolling Update Config */}
      {spec.updateStrategy?.rollingUpdate && (
        <div className="bg-gray-900/50 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">Rolling Update Config</div>
          <div className="text-xs text-gray-400">
            <span className="text-gray-500">maxUnavailable:</span>{' '}
            <span className="text-amber-400">{spec.updateStrategy.rollingUpdate.maxUnavailable ?? 1}</span>
            {spec.updateStrategy.rollingUpdate.maxSurge && (
              <>
                <span className="mx-2 text-gray-600">|</span>
                <span className="text-gray-500">maxSurge:</span>{' '}
                <span className="text-cyan-400">{spec.updateStrategy.rollingUpdate.maxSurge}</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Conditions */}
      {status?.conditions && status.conditions.length > 0 && (
        <ConditionsSection conditions={status.conditions} />
      )}

      {/* Node Selector */}
      {spec.template?.spec?.nodeSelector && Object.keys(spec.template.spec.nodeSelector).length > 0 && (
        <div>
          <h5 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
            Node Selector
          </h5>
          <div className="space-y-1">
            {Object.entries(spec.template.spec.nodeSelector).map(([key, value]) => (
              <div key={key} className="text-xs bg-gray-900/50 px-2 py-1.5 rounded">
                <span className="text-purple-400">{key}</span>
                <span className="text-gray-600 mx-1">=</span>
                <span className="text-cyan-400">{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

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

registerVisualizer('DaemonSet', DaemonSetVisualizer);
registerVisualizer('DaemonSets', DaemonSetVisualizer);

