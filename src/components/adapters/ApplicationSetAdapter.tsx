// ArgoCD ApplicationSet Adapter
// Extracts display data from ArgoCD ApplicationSet resources (argoproj.io/v1alpha1)

import { CheckCircle2, XCircle, RefreshCw, HelpCircle, Layers, GitBranch, FolderTree, List, Server, Cloud, Package } from 'lucide-react';
import type { ResourceAdapter, ResourceSections, StatusLevel } from './types';


// ApplicationSet types
interface ApplicationSetGenerator {
  // List generator
  list?: {
    elements?: Array<Record<string, unknown>>;
  };
  // Cluster generator
  clusters?: {
    selector?: {
      matchLabels?: Record<string, string>;
      matchExpressions?: Array<{
        key: string;
        operator: string;
        values?: string[];
      }>;
    };
    values?: Record<string, string>;
  };
  // Git generator
  git?: {
    repoURL?: string;
    revision?: string;
    directories?: Array<{ path: string; exclude?: boolean }>;
    files?: Array<{ path: string }>;
  };
  // Matrix generator (combines other generators)
  matrix?: {
    generators?: ApplicationSetGenerator[];
  };
  // Merge generator
  merge?: {
    generators?: ApplicationSetGenerator[];
    mergeKeys?: string[];
  };
  // SCM Provider generator
  scmProvider?: {
    github?: {
      organization?: string;
      appSecretName?: string;
    };
    gitlab?: {
      group?: string;
    };
    bitbucket?: {
      owner?: string;
    };
    bitbucketServer?: {
      project?: string;
    };
    gitea?: {
      owner?: string;
    };
    azureDevOps?: {
      organization?: string;
      teamProject?: string;
    };
    filters?: Array<{
      repositoryMatch?: string;
      branchMatch?: string;
      labelMatch?: string;
    }>;
  };
  // Pull Request generator
  pullRequest?: {
    github?: {
      owner?: string;
      repo?: string;
    };
    gitlab?: {
      project?: string;
    };
    bitbucketServer?: {
      project?: string;
      repo?: string;
    };
    filters?: Array<{
      branchMatch?: string;
    }>;
  };
  // Cluster Decision Resource generator
  clusterDecisionResource?: {
    configMapRef?: string;
    labelSelector?: {
      matchLabels?: Record<string, string>;
    };
  };
  // Duck Type generator
  selector?: {
    matchLabels?: Record<string, string>;
  };
}

interface ApplicationSetTemplate {
  metadata?: {
    name?: string;
    namespace?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  spec?: {
    source?: {
      repoURL?: string;
      path?: string;
      targetRevision?: string;
      chart?: string;
    };
    sources?: Array<{
      repoURL?: string;
      path?: string;
      targetRevision?: string;
      chart?: string;
    }>;
    destination?: {
      server?: string;
      namespace?: string;
      name?: string;
    };
    project?: string;
    syncPolicy?: {
      automated?: {
        prune?: boolean;
        selfHeal?: boolean;
      };
      syncOptions?: string[];
    };
  };
}

interface ApplicationSetStatus {
  conditions?: Array<{
    type?: string;
    status?: string;
    reason?: string;
    message?: string;
    lastTransitionTime?: string;
  }>;
  applicationStatus?: Array<{
    application?: string;
    message?: string;
    status?: string;
    step?: string;
  }>;
}

interface ApplicationSetSpec {
  generators?: ApplicationSetGenerator[];
  template?: ApplicationSetTemplate;
  syncPolicy?: {
    preserveResourcesOnDeletion?: boolean;
    applicationsSync?: 'create-only' | 'create-update' | 'create-delete' | 'sync';
  };
  strategy?: {
    type?: 'AllAtOnce' | 'RollingSync';
    rollingSync?: {
      steps?: Array<{
        matchExpressions?: Array<{
          key: string;
          operator: string;
          values?: string[];
        }>;
        maxUpdate?: string | number;
      }>;
    };
  };
  goTemplate?: boolean;
  goTemplateOptions?: string[];
}

interface ArgoCDApplicationSet {
  apiVersion?: string;
  kind?: string;
  metadata?: {
    name?: string;
    namespace?: string;
    uid?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
    creationTimestamp?: string;
  };
  spec?: ApplicationSetSpec;
  status?: ApplicationSetStatus;
}

// Get overall status from conditions
function getOverallStatus(conditions?: ApplicationSetStatus['conditions']): { status: string; level: StatusLevel } {
  if (!conditions || conditions.length === 0) {
    return { status: 'Unknown', level: 'neutral' };
  }

  // Check for errors first
  const errorCondition = conditions.find(c => c.type === 'ErrorOccurred' && c.status === 'True');
  if (errorCondition) {
    return { status: 'Error', level: 'error' };
  }

  // Check if resources are up to date
  const upToDateCondition = conditions.find(c => c.type === 'ResourcesUpToDate');
  if (upToDateCondition?.status === 'True') {
    return { status: 'Healthy', level: 'success' };
  }

  // Check if parameters are generated
  const parametersCondition = conditions.find(c => c.type === 'ParametersGenerated');
  if (parametersCondition?.status === 'True') {
    return { status: 'Progressing', level: 'warning' };
  }

  return { status: 'Unknown', level: 'neutral' };
}

// Get icon for overall status
function getStatusIcon(level: StatusLevel) {
  switch (level) {
    case 'success':
      return <CheckCircle2 size={14} className="text-emerald-400" />;
    case 'warning':
      return <RefreshCw size={14} className="text-amber-400" />;
    case 'error':
      return <XCircle size={14} className="text-red-400" />;
    default:
      return <HelpCircle size={14} className="text-gray-400" />;
  }
}

// Get generator type name and icon
function getGeneratorInfo(generator: ApplicationSetGenerator): { name: string; icon: React.ReactNode; details?: string } {
  if (generator.list) {
    const count = generator.list.elements?.length || 0;
    return { 
      name: 'List', 
      icon: <List size={12} className="text-blue-400" />,
      details: `${count} element${count !== 1 ? 's' : ''}`,
    };
  }
  if (generator.clusters) {
    return { 
      name: 'Clusters', 
      icon: <Server size={12} className="text-purple-400" />,
      details: generator.clusters.selector?.matchLabels 
        ? Object.entries(generator.clusters.selector.matchLabels).map(([k, v]) => `${k}=${v}`).join(', ')
        : 'All clusters',
    };
  }
  if (generator.git) {
    const hasDirectories = generator.git.directories && generator.git.directories.length > 0;
    const hasFiles = generator.git.files && generator.git.files.length > 0;
    return { 
      name: hasFiles ? 'Git Files' : 'Git Directories', 
      icon: <GitBranch size={12} className="text-cyan-400" />,
      details: hasDirectories 
        ? generator.git.directories?.map(d => d.path).join(', ')
        : hasFiles 
          ? generator.git.files?.map(f => f.path).join(', ')
          : generator.git.revision || 'HEAD',
    };
  }
  if (generator.matrix) {
    const subGenerators = generator.matrix.generators?.length || 0;
    return { 
      name: 'Matrix', 
      icon: <Layers size={12} className="text-amber-400" />,
      details: `${subGenerators} generator${subGenerators !== 1 ? 's' : ''}`,
    };
  }
  if (generator.merge) {
    const subGenerators = generator.merge.generators?.length || 0;
    return { 
      name: 'Merge', 
      icon: <Layers size={12} className="text-orange-400" />,
      details: `${subGenerators} generator${subGenerators !== 1 ? 's' : ''}`,
    };
  }
  if (generator.scmProvider) {
    const provider = generator.scmProvider.github ? 'GitHub' 
      : generator.scmProvider.gitlab ? 'GitLab'
      : generator.scmProvider.bitbucket ? 'Bitbucket'
      : generator.scmProvider.bitbucketServer ? 'Bitbucket Server'
      : generator.scmProvider.gitea ? 'Gitea'
      : generator.scmProvider.azureDevOps ? 'Azure DevOps'
      : 'Unknown';
    return { 
      name: `SCM Provider (${provider})`, 
      icon: <Cloud size={12} className="text-green-400" />,
      details: generator.scmProvider.github?.organization 
        || generator.scmProvider.gitlab?.group
        || generator.scmProvider.bitbucket?.owner
        || generator.scmProvider.azureDevOps?.organization,
    };
  }
  if (generator.pullRequest) {
    const provider = generator.pullRequest.github ? 'GitHub' 
      : generator.pullRequest.gitlab ? 'GitLab'
      : generator.pullRequest.bitbucketServer ? 'Bitbucket Server'
      : 'Unknown';
    return { 
      name: `Pull Request (${provider})`, 
      icon: <GitBranch size={12} className="text-pink-400" />,
      details: generator.pullRequest.github?.repo 
        || generator.pullRequest.gitlab?.project
        || generator.pullRequest.bitbucketServer?.repo,
    };
  }
  if (generator.clusterDecisionResource) {
    return { 
      name: 'Cluster Decision Resource', 
      icon: <FolderTree size={12} className="text-indigo-400" />,
      details: generator.clusterDecisionResource.configMapRef,
    };
  }
  return { 
    name: 'Unknown', 
    icon: <HelpCircle size={12} className="text-gray-400" />,
  };
}

// Extract repo name from URL
function getRepoName(url?: string): string {
  if (!url) return 'Unknown';
  const match = url.match(/[:/]([^/:]+\/[^/:]+?)(?:\.git)?$/);
  return match ? match[1] : url;
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

export const ApplicationSetAdapter: ResourceAdapter<ArgoCDApplicationSet> = {
  kinds: ['ApplicationSet', 'ApplicationSets'],

  adapt(resource): ResourceSections {
    const spec = resource.spec;
    const status = resource.status;
    const metadata = resource.metadata;

    if (!spec) {
      return { sections: [] };
    }

    const template = spec.template;
    const source = template?.spec?.source || template?.spec?.sources?.[0];
    const overallStatus = getOverallStatus(status?.conditions);

    // Count generated applications
    const applicationCount = status?.applicationStatus?.length || 0;

    // Parse conditions for display
    const conditions = status?.conditions?.map(c => ({
      type: c.type || 'Unknown',
      status: c.status || 'Unknown',
      reason: c.reason,
      message: c.message,
      isPositive: c.type !== 'ErrorOccurred' 
        ? c.status === 'True' 
        : c.status === 'False',
    })) || [];

    return {
      sections: [
        // Main status overview
        {
          id: 'status',
          data: {
            type: 'status-cards',
            items: [
              {
                label: 'Status',
                value: overallStatus.status,
                status: overallStatus.level,
                icon: getStatusIcon(overallStatus.level),
              },
              {
                label: 'Applications',
                value: applicationCount,
                status: applicationCount > 0 ? 'success' : 'neutral',
                icon: <Package size={14} className={applicationCount > 0 ? 'text-emerald-400' : 'text-gray-400'} />,
              },
              {
                label: 'Generators',
                value: spec.generators?.length || 0,
                status: 'neutral',
                icon: <Layers size={14} className="text-blue-400" />,
              },
            ],
          },
        },

        // Generators section
        ...(spec.generators?.length ? [{
          id: 'generators',
          title: 'Generators',
          data: {
            type: 'custom' as const,
            render: () => {
              return (
                <div className="space-y-2">
                  {spec.generators!.map((generator, idx) => {
                    const info = getGeneratorInfo(generator);
                    return (
                      <div 
                        key={idx}
                        className="bg-neutral-100 dark:bg-neutral-800/50 rounded-lg p-2.5 flex items-center gap-3"
                      >
                        <div className="p-1.5 bg-neutral-200 dark:bg-neutral-700/50 rounded">
                          {info.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-neutral-900 dark:text-neutral-200">
                            {info.name}
                          </div>
                          {info.details && (
                            <div className="text-[10px] text-neutral-500 truncate" title={info.details}>
                              {info.details}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            },
          },
        }] : []),

        // Generated Applications
        ...(status?.applicationStatus?.length ? [{
          id: 'applications',
          title: 'Generated Applications',
          data: {
            type: 'custom' as const,
            render: () => {
              return (
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {status!.applicationStatus!.map((appStatus, idx) => {
                    const statusLevel = appStatus.status === 'Successful' || appStatus.status === 'Healthy'
                      ? 'success'
                      : appStatus.status === 'Waiting' || appStatus.status === 'Progressing'
                        ? 'warning'
                        : appStatus.status === 'Error' || appStatus.status === 'Failed'
                          ? 'error'
                          : 'neutral';
                    
                    return (
                      <div 
                        key={appStatus.application || idx}
                        className="flex items-center gap-2 text-xs bg-neutral-100 dark:bg-neutral-800/30 rounded px-2 py-1.5"
                      >
                        {statusLevel === 'success' && <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />}
                        {statusLevel === 'warning' && <RefreshCw size={12} className="text-amber-400 shrink-0" />}
                        {statusLevel === 'error' && <XCircle size={12} className="text-red-400 shrink-0" />}
                        {statusLevel === 'neutral' && <HelpCircle size={12} className="text-gray-400 shrink-0" />}
                        <span className="text-neutral-700 dark:text-neutral-300 truncate flex-1" title={appStatus.application}>
                          {appStatus.application || 'Unknown'}
                        </span>
                        {appStatus.status && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                            statusLevel === 'success' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                            statusLevel === 'warning' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
                            statusLevel === 'error' ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                            'bg-gray-500/20 text-gray-400 border-gray-500/30'
                          }`}>
                            {appStatus.status}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            },
          },
        }] : []),

        // Template source information
        ...(source ? [{
          id: 'template-source',
          title: 'Template Source',
          data: {
            type: 'info-grid' as const,
            items: [
              { label: 'Repository', value: getRepoName(source.repoURL), color: 'text-cyan-400' },
              { label: 'Path', value: source.path || source.chart || '/', color: 'text-purple-400' },
              { label: 'Revision', value: source.targetRevision || 'HEAD', color: 'text-blue-400' },
            ],
            columns: 2 as const,
          },
        }] : []),

        // Template destination information
        ...(template?.spec?.destination ? [{
          id: 'template-destination',
          title: 'Template Destination',
          data: {
            type: 'info-grid' as const,
            items: [
              { label: 'Server', value: template.spec.destination.name || template.spec.destination.server || '{{server}}' },
              { label: 'Namespace', value: template.spec.destination.namespace || '{{namespace}}', color: 'text-cyan-400' },
              { label: 'Project', value: template.spec.project || 'default', color: 'text-purple-400' },
            ],
            columns: 2 as const,
          },
        }] : []),

        // Sync Policy
        ...(spec.syncPolicy ? [{
          id: 'sync-policy',
          title: 'Sync Policy',
          data: {
            type: 'info-grid' as const,
            items: [
              { 
                label: 'Preserve Resources on Deletion', 
                value: spec.syncPolicy.preserveResourcesOnDeletion ? 'Yes' : 'No',
                color: spec.syncPolicy.preserveResourcesOnDeletion ? 'text-amber-400' : undefined,
              },
              ...(spec.syncPolicy.applicationsSync ? [{
                label: 'Applications Sync',
                value: spec.syncPolicy.applicationsSync,
                color: 'text-blue-400',
              }] : []),
            ],
            columns: 2 as const,
          },
        }] : []),

        // Strategy
        ...(spec.strategy ? [{
          id: 'strategy',
          title: 'Rollout Strategy',
          data: {
            type: 'info-grid' as const,
            items: [
              { 
                label: 'Type', 
                value: spec.strategy.type || 'AllAtOnce',
                color: spec.strategy.type === 'RollingSync' ? 'text-cyan-400' : undefined,
              },
              ...(spec.strategy.rollingSync?.steps?.length ? [{
                label: 'Steps',
                value: spec.strategy.rollingSync.steps.length,
              }] : []),
            ],
            columns: 2 as const,
          },
        }] : []),

        // Template options
        ...(spec.goTemplate !== undefined ? [{
          id: 'template-options',
          title: 'Template Options',
          data: {
            type: 'info-grid' as const,
            items: [
              { 
                label: 'Go Template', 
                value: spec.goTemplate ? 'Enabled' : 'Disabled',
                color: spec.goTemplate ? 'text-emerald-400' : 'text-gray-400',
              },
              ...(spec.goTemplateOptions?.length ? [{
                label: 'Options',
                value: spec.goTemplateOptions.join(', '),
              }] : []),
            ],
            columns: 2 as const,
          },
        }] : []),

        // Conditions
        ...(conditions.length > 0 ? [{
          id: 'conditions',
          title: 'Conditions',
          data: {
            type: 'conditions' as const,
            items: conditions,
          },
        }] : []),

        // Created timestamp
        ...(metadata?.creationTimestamp ? [{
          id: 'timing',
          data: {
            type: 'info-grid' as const,
            items: [
              {
                label: 'Created',
                value: timeAgo(metadata.creationTimestamp),
              },
            ],
            columns: 1 as const,
          },
        }] : []),
      ],
    };
  },
};
