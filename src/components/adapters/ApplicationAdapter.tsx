// ArgoCD Application Adapter
// Extracts display data from ArgoCD Application resources (argoproj.io/v1alpha1)

import { CheckCircle2, XCircle, AlertCircle, RefreshCw, Pause, HelpCircle, Package, Play, RotateCcw } from 'lucide-react';
import type { ResourceAdapter, ResourceSections, StatusLevel } from './types';
import { syncApplication, refreshApplication } from '../../api/kubernetesArgoCD';


// ArgoCD Application types
interface ApplicationSource {
  repoURL?: string;
  path?: string;
  targetRevision?: string;
  chart?: string;
  helm?: {
    valueFiles?: string[];
    values?: string;
    parameters?: Array<{ name: string; value: string }>;
  };
  kustomize?: {
    namePrefix?: string;
    nameSuffix?: string;
    images?: string[];
  };
}

interface ApplicationDestination {
  server?: string;
  namespace?: string;
  name?: string;
}

interface SyncStatus {
  status?: string;
  revision?: string;
  comparedTo?: {
    source?: ApplicationSource;
    destination?: ApplicationDestination;
  };
}

interface HealthStatus {
  status?: string;
  message?: string;
}

interface ResourceStatus {
  group?: string;
  version?: string;
  kind?: string;
  namespace?: string;
  name?: string;
  status?: string;  // Sync status: Synced, OutOfSync, Unknown
  health?: HealthStatus;  // Health status: Healthy, Progressing, Degraded, Suspended, Missing, Unknown
  hook?: boolean;
  requiresPruning?: boolean;
}

interface OperationState {
  phase?: string;  // Running, Succeeded, Failed, Error
  message?: string;
  syncResult?: {
    revision?: string;
    resources?: ResourceStatus[];
  };
  startedAt?: string;
  finishedAt?: string;
  operation?: {
    sync?: {
      revision?: string;
      prune?: boolean;
    };
  };
}

interface ApplicationSpec {
  source?: ApplicationSource;
  sources?: ApplicationSource[];
  destination?: ApplicationDestination;
  project?: string;
  syncPolicy?: {
    automated?: {
      prune?: boolean;
      selfHeal?: boolean;
      allowEmpty?: boolean;
    };
    syncOptions?: string[];
    retry?: {
      limit?: number;
      backoff?: {
        duration?: string;
        factor?: number;
        maxDuration?: string;
      };
    };
  };
  ignoreDifferences?: Array<{
    group?: string;
    kind?: string;
    name?: string;
    namespace?: string;
    jsonPointers?: string[];
    jqPathExpressions?: string[];
  }>;
}

interface ApplicationStatus {
  sync?: SyncStatus;
  health?: HealthStatus;
  operationState?: OperationState;
  reconciledAt?: string;
  resources?: ResourceStatus[];
  summary?: {
    images?: string[];
    externalURLs?: string[];
  };
  history?: Array<{
    revision?: string;
    deployedAt?: string;
    id?: number;
    source?: ApplicationSource;
  }>;
}

interface ArgoCDApplication {
  apiVersion?: string;
  kind?: string;
  metadata?: {
    name?: string;
    namespace?: string;
    uid?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  spec?: ApplicationSpec;
  status?: ApplicationStatus;
}

// Map ArgoCD sync status to our status levels
function getSyncStatusLevel(status?: string): StatusLevel {
  switch (status) {
    case 'Synced':
      return 'success';
    case 'OutOfSync':
      return 'warning';
    case 'Unknown':
    default:
      return 'neutral';
  }
}

// Map ArgoCD health status to our status levels
// Valid values: Healthy, Progressing, Degraded, Suspended, Missing, Unknown
function getHealthStatusLevel(status?: string): StatusLevel {
  switch (status) {
    case 'Healthy':
      return 'success';
    case 'Progressing':
      return 'warning';
    case 'Degraded':
    case 'Missing':
      return 'error';
    case 'Suspended':
      return 'warning';
    case 'Unknown':
    default:
      return 'neutral';
  }
}

// Get appropriate icon for sync status
function getSyncIcon(status?: string) {
  switch (status) {
    case 'Synced':
      return <CheckCircle2 size={14} className="text-emerald-400" />;
    case 'OutOfSync':
      return <RefreshCw size={14} className="text-amber-400" />;
    default:
      return <AlertCircle size={14} className="text-gray-400" />;
  }
}

// Get appropriate icon for health status
function getHealthIcon(status?: string) {
  switch (status) {
    case 'Healthy':
      return <CheckCircle2 size={14} className="text-emerald-400" />;
    case 'Progressing':
      return <RefreshCw size={14} className="text-blue-400 animate-spin" />;
    case 'Degraded':
      return <XCircle size={14} className="text-red-400" />;
    case 'Missing':
      return <AlertCircle size={14} className="text-red-400" />;
    case 'Suspended':
      return <Pause size={14} className="text-amber-400" />;
    case 'Unknown':
    default:
      return <HelpCircle size={14} className="text-gray-400" />;
  }
}

// Get small icon for resource list
function getResourceHealthIcon(health?: string, size = 12) {
  switch (health) {
    case 'Healthy':
      return <CheckCircle2 size={size} className="text-emerald-400 shrink-0" />;
    case 'Progressing':
      return <RefreshCw size={size} className="text-blue-400 animate-spin shrink-0" />;
    case 'Degraded':
      return <XCircle size={size} className="text-red-400 shrink-0" />;
    case 'Missing':
      return <AlertCircle size={size} className="text-red-400 shrink-0" />;
    case 'Suspended':
      return <Pause size={size} className="text-amber-400 shrink-0" />;
    default:
      return <HelpCircle size={size} className="text-gray-400 shrink-0" />;
  }
}

// Get sync status badge
function getSyncBadge(status?: string) {
  const colors = {
    Synced: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    OutOfSync: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    Unknown: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  };
  const color = colors[status as keyof typeof colors] || colors.Unknown;
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${color}`}>
      {status || 'Unknown'}
    </span>
  );
}

// Format time ago
function timeAgo(dateString?: string): string {
  if (!dateString) return 'Unknown';
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// Extract repo name from URL
function getRepoName(url?: string): string {
  if (!url) return 'Unknown';
  // Handle git URLs like git@github.com:org/repo.git or https://github.com/org/repo.git
  const match = url.match(/[:/]([^/:]+\/[^/:]+?)(?:\.git)?$/);
  return match ? match[1] : url;
}

export const ApplicationAdapter: ResourceAdapter<ArgoCDApplication> = {
  kinds: ['Application', 'Applications'],

  adapt(resource): ResourceSections {
    const spec = resource.spec;
    const status = resource.status;

    if (!spec) {
      return { sections: [] };
    }

    const source = spec.source || spec.sources?.[0];
    const syncStatus = status?.sync?.status || 'Unknown';
    const healthStatus = status?.health?.status || 'Unknown';
    const operationPhase = status?.operationState?.phase;

    // Count resources by health status
    const resourceCounts = {
      healthy: 0,
      progressing: 0,
      degraded: 0,
      missing: 0,
      suspended: 0,
      unknown: 0,
    };
    
    status?.resources?.forEach(r => {
      // Resources without health status (like Services) are considered healthy if synced
      const healthStatus = r.health?.status;
      let health: string;
      if (healthStatus) {
        health = healthStatus.toLowerCase();
      } else {
        // No health status - consider healthy if synced, otherwise unknown
        health = r.status === 'Synced' ? 'healthy' : 'unknown';
      }
      if (health in resourceCounts) {
        resourceCounts[health as keyof typeof resourceCounts]++;
      }
    });

    const totalResources = status?.resources?.length || 0;

    return {
      sections: [
        // Main status overview
        {
          id: 'status',
          data: {
            type: 'status-cards',
            items: [
              {
                label: 'Sync Status',
                value: syncStatus,
                status: getSyncStatusLevel(syncStatus),
                icon: getSyncIcon(syncStatus),
              },
              {
                label: 'Health',
                value: healthStatus,
                status: getHealthStatusLevel(healthStatus),
                icon: getHealthIcon(healthStatus),
              },
              ...(operationPhase ? [{
                label: 'Operation',
                value: operationPhase,
                status: (operationPhase === 'Succeeded' ? 'success' : operationPhase === 'Failed' ? 'error' : 'warning') as StatusLevel,
                icon: operationPhase === 'Running' ? <RefreshCw size={14} className="animate-spin" /> : undefined,
              }] : []),
            ],
          },
        },

        // Resource health gauges
        ...(totalResources > 0 ? [{
          id: 'resource-health',
          title: 'Resource Health',
          data: {
            type: 'gauges' as const,
            items: [
              { label: 'Healthy', current: resourceCounts.healthy, total: totalResources, color: 'emerald' as const },
              { label: 'Progressing', current: resourceCounts.progressing, total: totalResources, color: 'blue' as const },
              { label: 'Degraded', current: resourceCounts.degraded + resourceCounts.missing, total: totalResources, color: 'amber' as const },
            ],
          },
        }] : []),

        // Managed Resources list
        ...(status?.resources?.length ? [{
          id: 'resources',
          title: 'Managed Resources',
          data: {
            type: 'custom' as const,
            render: () => {
              // Group resources by kind
              const resourcesByKind = new Map<string, ResourceStatus[]>();
              status.resources!.forEach(r => {
                const kind = r.kind || 'Unknown';
                if (!resourcesByKind.has(kind)) {
                  resourcesByKind.set(kind, []);
                }
                resourcesByKind.get(kind)!.push(r);
              });

              // Sort kinds: unhealthy first, then alphabetically
              const sortedKinds = Array.from(resourcesByKind.keys()).sort((a, b) => {
                const aResources = resourcesByKind.get(a)!;
                const bResources = resourcesByKind.get(b)!;
                const aUnhealthy = aResources.some(r => r.health?.status !== 'Healthy');
                const bUnhealthy = bResources.some(r => r.health?.status !== 'Healthy');
                if (aUnhealthy && !bUnhealthy) return -1;
                if (!aUnhealthy && bUnhealthy) return 1;
                return a.localeCompare(b);
              });

              return (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {sortedKinds.map(kind => {
                    const resources = resourcesByKind.get(kind)!;
                    // Sort resources: unhealthy first, then by name
                    const sortedResources = [...resources].sort((a, b) => {
                      const aHealthy = a.health?.status === 'Healthy';
                      const bHealthy = b.health?.status === 'Healthy';
                      if (!aHealthy && bHealthy) return -1;
                      if (aHealthy && !bHealthy) return 1;
                      return (a.name || '').localeCompare(b.name || '');
                    });

                    return (
                      <div key={kind} className="bg-neutral-100 dark:bg-neutral-800/50 rounded-lg p-2">
                        <div className="flex items-center gap-2 mb-1.5">
                          <Package size={12} className="text-neutral-500" />
                          <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">{kind}</span>
                          <span className="text-[10px] text-neutral-500 dark:text-neutral-600">({resources.length})</span>
                        </div>
                        <div className="space-y-1">
                          {sortedResources.map((r, idx) => (
                            <div 
                              key={`${r.namespace}-${r.name}-${idx}`}
                              className="flex items-center gap-2 text-xs pl-4"
                            >
                              {getResourceHealthIcon(r.health?.status)}
                              <span className="text-neutral-700 dark:text-neutral-300 truncate flex-1" title={r.name}>
                                {r.name}
                              </span>
                              {r.namespace && (
                                <span className="text-neutral-500 dark:text-neutral-600 text-[10px]">{r.namespace}</span>
                              )}
                              {getSyncBadge(r.status)}
                              {r.requiresPruning && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded border bg-red-500/20 text-red-400 border-red-500/30">
                                  Prune
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            },
          },
        }] : []),

        // Source information
        {
          id: 'source',
          title: 'Source',
          data: {
            type: 'info-grid',
            items: [
              { label: 'Repository', value: getRepoName(source?.repoURL), color: 'text-cyan-400' },
              { label: 'Path', value: source?.path || source?.chart || '/', color: 'text-purple-400' },
              { label: 'Target Revision', value: source?.targetRevision || 'HEAD', color: 'text-blue-400' },
              ...(status?.sync?.revision ? [{
                label: 'Current Revision',
                value: status.sync.revision.substring(0, 7),
                color: 'text-emerald-400',
              }] : []),
            ],
            columns: 2 as const,
          },
        },

        // Destination information
        {
          id: 'destination',
          title: 'Destination',
          data: {
            type: 'info-grid',
            items: [
              { label: 'Server', value: spec.destination?.name || spec.destination?.server || 'Unknown' },
              { label: 'Namespace', value: spec.destination?.namespace || 'default', color: 'text-cyan-400' },
              { label: 'Project', value: spec.project || 'default', color: 'text-purple-400' },
            ],
            columns: 2 as const,
          },
        },

        // Sync policy
        ...(spec.syncPolicy ? [{
          id: 'sync-policy',
          title: 'Sync Policy',
          data: {
            type: 'info-grid' as const,
            items: [
              ...(spec.syncPolicy.automated ? [
                { label: 'Auto Sync', value: 'Enabled', color: 'text-emerald-400' },
                { label: 'Prune', value: spec.syncPolicy.automated.prune ? 'Yes' : 'No', color: spec.syncPolicy.automated.prune ? 'text-amber-400' : undefined },
                { label: 'Self Heal', value: spec.syncPolicy.automated.selfHeal ? 'Yes' : 'No', color: spec.syncPolicy.automated.selfHeal ? 'text-emerald-400' : undefined },
              ] : [
                { label: 'Auto Sync', value: 'Disabled', color: 'text-gray-400' },
              ]),
              ...(spec.syncPolicy.retry?.limit ? [{
                label: 'Retry Limit',
                value: spec.syncPolicy.retry.limit,
              }] : []),
            ],
            columns: 2 as const,
          },
        }] : []),

        // Sync options
        ...(spec.syncPolicy?.syncOptions?.length ? [{
          id: 'sync-options',
          data: {
            type: 'labels' as const,
            labels: Object.fromEntries(spec.syncPolicy.syncOptions.map(opt => {
              const [key, value] = opt.split('=');
              return [key, value || 'true'];
            })),
            title: 'Sync Options',
          },
        }] : []),

        // Last sync time
        ...(status?.reconciledAt || status?.operationState?.finishedAt ? [{
          id: 'timing',
          data: {
            type: 'info-grid' as const,
            items: [
              ...(status?.reconciledAt ? [{
                label: 'Last Reconciled',
                value: timeAgo(status.reconciledAt),
              }] : []),
              ...(status?.operationState?.startedAt ? [{
                label: 'Operation Started',
                value: timeAgo(status.operationState.startedAt),
              }] : []),
              ...(status?.operationState?.finishedAt ? [{
                label: 'Operation Finished',
                value: timeAgo(status.operationState.finishedAt),
              }] : []),
            ],
            columns: 2 as const,
          },
        }] : []),

        // Health message (if present)
        ...(status?.health?.message ? [{
          id: 'health-message',
          title: 'Health Message',
          data: {
            type: 'info-grid' as const,
            items: [
              { label: 'Message', value: status.health.message },
            ],
            columns: 1 as const,
          },
        }] : []),

        // Operation message (if present and recent)
        ...(status?.operationState?.message ? [{
          id: 'operation-message',
          title: 'Operation Message',
          data: {
            type: 'info-grid' as const,
            items: [
              { label: 'Message', value: status.operationState.message },
            ],
            columns: 1 as const,
          },
        }] : []),

        // Images (from summary)
        ...(status?.summary?.images?.length ? [{
          id: 'images',
          title: 'Images',
          data: {
            type: 'container-images' as const,
            containers: status.summary.images.map((image, i) => ({
              name: `image-${i + 1}`,
              image,
            })),
          },
        }] : []),
      ],
    };
  },

  // Actions available for ArgoCD Applications
  actions: [
    {
      id: 'sync',
      label: 'Sync',
      icon: <Play size={14} />,
      variant: 'primary',
      confirm: {
        title: 'Sync Application',
        message: 'This will sync the application to match the desired state in Git. Continue?',
        confirmLabel: 'Sync',
      },
      execute: async (resource) => {
        const name = resource.metadata?.name;
        const namespace = resource.metadata?.namespace || 'argocd';
        if (!name) throw new Error('Application name is required');
        await syncApplication(name, namespace);
      },
      // Disable sync if an operation is already running
      isDisabled: (resource) => {
        const status = (resource as ArgoCDApplication).status;
        if (status?.operationState?.phase === 'Running') {
          return 'Sync already in progress';
        }
        return false;
      },
    },
    {
      id: 'sync-prune',
      label: 'Sync (Prune)',
      icon: <Play size={14} />,
      variant: 'warning',
      confirm: {
        title: 'Sync with Prune',
        message: 'This will sync the application and DELETE resources that are no longer in Git. This action cannot be undone. Continue?',
        confirmLabel: 'Sync & Prune',
      },
      execute: async (resource) => {
        const name = resource.metadata?.name;
        const namespace = resource.metadata?.namespace || 'argocd';
        if (!name) throw new Error('Application name is required');
        await syncApplication(name, namespace, { prune: true });
      },
      isDisabled: (resource) => {
        const status = (resource as ArgoCDApplication).status;
        if (status?.operationState?.phase === 'Running') {
          return 'Sync already in progress';
        }
        return false;
      },
    },
    {
      id: 'refresh',
      label: 'Refresh',
      icon: <RotateCcw size={14} />,
      variant: 'secondary',
      execute: async (resource) => {
        const name = resource.metadata?.name;
        const namespace = resource.metadata?.namespace || 'argocd';
        if (!name) throw new Error('Application name is required');
        await refreshApplication(name, namespace);
      },
    },
    {
      id: 'hard-refresh',
      label: 'Hard Refresh',
      icon: <RotateCcw size={14} />,
      variant: 'secondary',
      confirm: {
        title: 'Hard Refresh',
        message: 'This will invalidate the manifest cache and re-fetch all manifests from Git. Continue?',
        confirmLabel: 'Hard Refresh',
      },
      execute: async (resource) => {
        const name = resource.metadata?.name;
        const namespace = resource.metadata?.namespace || 'argocd';
        if (!name) throw new Error('Application name is required');
        await refreshApplication(name, namespace, true);
      },
    },
  ],
};
