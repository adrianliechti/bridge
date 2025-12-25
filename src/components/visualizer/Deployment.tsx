import { useState, useEffect } from 'react';
import { Layers, RefreshCw, Box } from 'lucide-react';
import { registerVisualizer, type ResourceVisualizerProps } from './Visualizer';
import { StatusGauge as ReplicaGauge, ConditionsSection } from './shared';
import { getResourceList, getResourceConfig } from '../../api/kubernetes';
import type { V1Deployment } from '@kubernetes/client-node';

interface ReplicaSetDisplay {
  name: string;
  replicas: number;
  readyReplicas: number;
  revision?: string;
  images: string[];
  creationTime: string;
  isCurrent: boolean;
}

export function DeploymentVisualizer({ resource, namespace }: ResourceVisualizerProps) {
  const deployment = resource as unknown as V1Deployment;
  const spec = deployment.spec;
  const status = deployment.status;
  const metadata = deployment.metadata;
  const [replicaSets, setReplicaSets] = useState<ReplicaSetDisplay[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch ReplicaSets owned by this deployment
  useEffect(() => {
    async function fetchReplicaSets() {
      if (!namespace || !metadata) return;
      
      try {
        const rsConfig = await getResourceConfig('replicasets');
        if (!rsConfig) {
          console.warn('ReplicaSets resource config not found');
          return;
        }
        
        const replicaSets = await getResourceList(rsConfig, namespace);

        // Filter ReplicaSets owned by this deployment
        const deploymentName = metadata.name ?? '';
        const deploymentUid = metadata.uid;
        
        const ownedRS = replicaSets
          .filter(rs => {
            const meta = rs.metadata as Record<string, unknown>;
            const rsName = meta.name as string;
            
            // Check ownerReferences
            const refs = meta.ownerReferences as Array<{ name: string; uid: string; kind?: string }> | undefined;
            if (refs?.some(ref => (ref.kind === 'Deployment' && ref.name === deploymentName) || ref.uid === deploymentUid)) {
              return true;
            }
            
            // Fallback: match by name prefix (deployment-name-<hash>)
            if (rsName.startsWith(deploymentName + '-')) {
              const suffix = rsName.slice(deploymentName.length + 1);
              return /^[a-z0-9]{7,10}$/.test(suffix);
            }
            
            return false;
          })
          .map(rs => {
            const meta = rs.metadata as Record<string, unknown>;
            const rsSpec = rs.spec as { replicas?: number; template?: { spec?: { containers?: Array<{ image: string }> } } };
            const rsStatus = rs.status as { replicas?: number; readyReplicas?: number };
            const annotations = meta.annotations as Record<string, string> | undefined;
            
            return {
              name: meta.name as string,
              replicas: rsStatus?.replicas ?? 0,
              readyReplicas: rsStatus?.readyReplicas ?? 0,
              revision: annotations?.['deployment.kubernetes.io/revision'],
              images: rsSpec?.template?.spec?.containers?.map(c => c.image) ?? [],
              creationTime: meta.creationTimestamp as string,
              isCurrent: (rsStatus?.replicas ?? 0) > 0,
            };
          })
          .sort((a, b) => {
            // Sort by revision descending
            const revA = parseInt(a.revision ?? '0');
            const revB = parseInt(b.revision ?? '0');
            return revB - revA;
          });

        setReplicaSets(ownedRS);
      } catch (error) {
        console.error('Failed to fetch ReplicaSets:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchReplicaSets();
  }, [metadata?.name, metadata?.uid, namespace, metadata]);

  if (!spec) {
    return <div className="text-gray-500 text-sm">No deployment spec available</div>;
  }

  const desiredReplicas = spec.replicas ?? 1;
  const readyReplicas = status?.readyReplicas ?? 0;
  const updatedReplicas = status?.updatedReplicas ?? 0;
  const availableReplicas = status?.availableReplicas ?? 0;

  return (
    <div className="space-y-4">
      {/* Replica Status */}
      <div>
        <h5 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
          Replica Status
        </h5>
        <div className="bg-gray-900/50 rounded-lg p-3">
          <div className="flex items-center gap-4 mb-3">
            <ReplicaGauge 
              label="Ready" 
              current={readyReplicas} 
              total={desiredReplicas}
              color="emerald"
            />
            <ReplicaGauge 
              label="Updated" 
              current={updatedReplicas} 
              total={desiredReplicas}
              color="blue"
            />
            <ReplicaGauge 
              label="Available" 
              current={availableReplicas} 
              total={desiredReplicas}
              color="cyan"
            />
          </div>
          
          {/* Visual replica pods */}
          <div className="flex flex-wrap gap-1">
            {Array.from({ length: desiredReplicas }).map((_, i) => {
              const isReady = i < readyReplicas;
              const isAvailable = i < availableReplicas;
              return (
                <div
                  key={i}
                  className={`w-6 h-6 rounded flex items-center justify-center ${
                    isReady ? 'bg-emerald-500/20 border border-emerald-500/50' :
                    isAvailable ? 'bg-amber-500/20 border border-amber-500/50' :
                    'bg-gray-700/50 border border-gray-600'
                  }`}
                  title={isReady ? 'Ready' : isAvailable ? 'Available but not ready' : 'Pending'}
                >
                  <Box size={12} className={
                    isReady ? 'text-emerald-400' :
                    isAvailable ? 'text-amber-400' :
                    'text-gray-500'
                  } />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Strategy */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-900/50 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">Strategy</div>
          <div className="text-sm text-gray-100 flex items-center gap-2">
            <RefreshCw size={14} className="text-blue-400" />
            {spec.strategy?.type || 'RollingUpdate'}
          </div>
        </div>
        {spec.strategy?.rollingUpdate && (
          <div className="bg-gray-900/50 rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-1">Rolling Update</div>
            <div className="text-xs text-gray-400">
              <span className="text-gray-500">maxSurge:</span>{' '}
              <span className="text-cyan-400">{spec.strategy.rollingUpdate.maxSurge ?? '25%'}</span>
              <span className="mx-2 text-gray-600">|</span>
              <span className="text-gray-500">maxUnavailable:</span>{' '}
              <span className="text-amber-400">{spec.strategy.rollingUpdate.maxUnavailable ?? '25%'}</span>
            </div>
          </div>
        )}
      </div>

      {/* Conditions */}
      {status?.conditions && status.conditions.length > 0 && (
        <ConditionsSection conditions={status.conditions} />
      )}

      {/* ReplicaSets */}
      <div>
        <h5 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
          ReplicaSets
        </h5>
        {loading ? (
          <div className="text-xs text-gray-500">Loading ReplicaSets...</div>
        ) : replicaSets.length === 0 ? (
          <div className="text-xs text-gray-500">No ReplicaSets found</div>
        ) : (
          <div className="space-y-2">
            {replicaSets.map(rs => (
              <ReplicaSetCard key={rs.name} replicaSet={rs} />
            ))}
          </div>
        )}
      </div>

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

// Register this visualizer (both singular and plural to match resourceKind title)
registerVisualizer('Deployment', DeploymentVisualizer);
registerVisualizer('Deployments', DeploymentVisualizer);

// Helper components

function ReplicaSetCard({ replicaSet }: { replicaSet: ReplicaSetDisplay }) {
  return (
    <div className={`border rounded-lg p-2 ${
      replicaSet.isCurrent 
        ? 'border-blue-500/30 bg-blue-500/5' 
        : 'border-gray-700 bg-gray-900/50 opacity-60'
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers size={14} className={replicaSet.isCurrent ? 'text-blue-400' : 'text-gray-500'} />
          <span className="text-sm text-gray-100 truncate max-w-50" title={replicaSet.name}>
            {replicaSet.name}
          </span>
          {replicaSet.revision && (
            <span className="text-xs bg-gray-700 px-1.5 py-0.5 rounded text-gray-400">
              rev {replicaSet.revision}
            </span>
          )}
        </div>
        <div className="text-xs">
          <span className={replicaSet.readyReplicas === replicaSet.replicas ? 'text-emerald-400' : 'text-amber-400'}>
            {replicaSet.readyReplicas}/{replicaSet.replicas}
          </span>
          <span className="text-gray-500 ml-1">ready</span>
        </div>
      </div>
      {replicaSet.images.length > 0 && (
        <div className="mt-1 text-xs text-cyan-400/70 truncate">
          {replicaSet.images.join(', ')}
        </div>
      )}
    </div>
  );
}
