import { useState } from 'react';
import { Box, ChevronDown, ChevronRight, AlertTriangle, CheckCircle2, Link } from 'lucide-react';
import { registerVisualizer, type ResourceVisualizerProps } from './Visualizer';
import type { V1ReplicaSet, V1ReplicaSetCondition } from '@kubernetes/client-node';

export function ReplicaSetVisualizer({ resource }: ResourceVisualizerProps) {
  const replicaSet = resource as unknown as V1ReplicaSet;
  const spec = replicaSet.spec;
  const status = replicaSet.status;
  const metadata = replicaSet.metadata;

  if (!spec) {
    return <div className="text-gray-500 text-sm">No replicaset spec available</div>;
  }

  const desiredReplicas = spec.replicas ?? 1;
  const currentReplicas = status?.replicas ?? 0;
  const readyReplicas = status?.readyReplicas ?? 0;
  const availableReplicas = status?.availableReplicas ?? 0;
  const fullyLabeledReplicas = status?.fullyLabeledReplicas ?? 0;

  // Get owner reference (usually a Deployment)
  const ownerRef = metadata?.ownerReferences?.[0];

  // Get revision from annotations
  const revision = metadata?.annotations?.['deployment.kubernetes.io/revision'];

  return (
    <div className="space-y-4">
      {/* Owner Reference */}
      {ownerRef && (
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
            <Link size={10} /> Owned By
          </div>
          <div className="text-sm flex items-center gap-2">
            <span className="text-gray-500">{ownerRef.kind}:</span>
            <span className="text-cyan-400">{ownerRef.name}</span>
            {revision && (
              <span className="text-xs bg-gray-700 px-1.5 py-0.5 rounded text-gray-400">
                rev {revision}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Replica Status */}
      <div>
        <h5 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
          Replica Status
        </h5>
        <div className="bg-gray-900/50 rounded-lg p-3">
          <div className="flex items-center gap-4 mb-3">
            <StatusGauge 
              label="Ready" 
              current={readyReplicas} 
              total={desiredReplicas}
              color="emerald"
            />
            <StatusGauge 
              label="Current" 
              current={currentReplicas} 
              total={desiredReplicas}
              color="blue"
            />
            <StatusGauge 
              label="Available" 
              current={availableReplicas} 
              total={desiredReplicas}
              color="cyan"
            />
          </div>
          
          {/* Visual replica pods */}
          <div className="flex flex-wrap gap-1">
            {Array.from({ length: Math.max(desiredReplicas, currentReplicas) }).map((_, i) => {
              const isDesired = i < desiredReplicas;
              const isReady = i < readyReplicas;
              const isAvailable = i < availableReplicas;
              const isCurrent = i < currentReplicas;
              
              return (
                <div
                  key={i}
                  className={`w-6 h-6 rounded flex items-center justify-center ${
                    !isDesired ? 'bg-red-500/20 border border-red-500/50' :
                    isReady ? 'bg-emerald-500/20 border border-emerald-500/50' :
                    isAvailable ? 'bg-cyan-500/20 border border-cyan-500/50' :
                    isCurrent ? 'bg-amber-500/20 border border-amber-500/50' :
                    'bg-gray-700/50 border border-gray-600'
                  }`}
                  title={
                    !isDesired ? 'Terminating' :
                    isReady ? 'Ready' : 
                    isAvailable ? 'Available' : 
                    isCurrent ? 'Current but not ready' : 
                    'Pending'
                  }
                >
                  <Box size={12} className={
                    !isDesired ? 'text-red-400' :
                    isReady ? 'text-emerald-400' :
                    isAvailable ? 'text-cyan-400' :
                    isCurrent ? 'text-amber-400' :
                    'text-gray-500'
                  } />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Detailed Counts */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-900/50 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">Desired</div>
          <div className="text-sm text-gray-100">{desiredReplicas}</div>
        </div>
        <div className="bg-gray-900/50 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">Fully Labeled</div>
          <div className={`text-sm ${fullyLabeledReplicas === desiredReplicas ? 'text-emerald-400' : 'text-amber-400'}`}>
            {fullyLabeledReplicas}
          </div>
        </div>
      </div>

      {/* Selector */}
      {spec.selector?.matchLabels && (
        <div>
          <h5 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
            Selector
          </h5>
          <div className="space-y-1">
            {Object.entries(spec.selector.matchLabels).map(([key, value]) => (
              <div key={key} className="text-xs bg-gray-900/50 px-2 py-1.5 rounded">
                <span className="text-purple-400">{key}</span>
                <span className="text-gray-600 mx-1">=</span>
                <span className="text-cyan-400">{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Conditions */}
      {status?.conditions && status.conditions.length > 0 && (
        <ConditionsSection conditions={status.conditions} />
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

// Register this visualizer
registerVisualizer('ReplicaSet', ReplicaSetVisualizer);
registerVisualizer('ReplicaSets', ReplicaSetVisualizer);

// Helper components

function StatusGauge({ 
  label, 
  current, 
  total, 
  color 
}: { 
  label: string; 
  current: number; 
  total: number; 
  color: 'emerald' | 'blue' | 'cyan';
}) {
  const percentage = total > 0 ? (current / total) * 100 : 0;
  const colorClasses = {
    emerald: 'text-emerald-400',
    blue: 'text-blue-400',
    cyan: 'text-cyan-400',
  };

  return (
    <div className="flex-1">
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-gray-500">{label}</span>
        <span className={colorClasses[color]}>{current}/{total}</span>
      </div>
      <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
        <div 
          className={`h-full ${
            color === 'emerald' ? 'bg-emerald-500' :
            color === 'blue' ? 'bg-blue-500' : 'bg-cyan-500'
          }`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
    </div>
  );
}

function ConditionsSection({ conditions }: { conditions: V1ReplicaSetCondition[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs font-medium text-gray-500 uppercase tracking-wider mb-2 hover:text-gray-300 transition-colors"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        Conditions ({conditions.length})
      </button>
      {expanded && (
        <div className="space-y-1">
          {conditions.map((condition, i) => (
            <div 
              key={i} 
              className={`flex items-start gap-2 text-xs px-2 py-1.5 rounded ${
                condition.status === 'True' 
                  ? 'bg-emerald-500/10 border border-emerald-500/20' 
                  : 'bg-gray-900/50 border border-gray-700'
              }`}
            >
              {condition.status === 'True' ? (
                <CheckCircle2 size={12} className="text-emerald-400 mt-0.5" />
              ) : (
                <AlertTriangle size={12} className="text-amber-400 mt-0.5" />
              )}
              <div>
                <div className="text-gray-300">{condition.type}</div>
                {condition.reason && (
                  <div className="text-gray-500">{condition.reason}</div>
                )}
                {condition.message && (
                  <div className="text-gray-500 text-[10px] mt-1">{condition.message}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
