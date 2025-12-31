/* eslint-disable react-refresh/only-export-components */
// GRPCRoute Adapter
// Extracts display data from Gateway API GRPCRoute resources

import React from 'react';
import { Network, GitBranch, Link } from 'lucide-react';
import type { ResourceAdapter, ResourceSections } from './types';
import { getConditionDescription } from './utils';

interface GRPCRule {
  matches?: Array<{
    method?: {
      service?: string;
      method?: string;
    };
  }>;
  backendRefs?: Array<{
    name: string;
    port?: number;
    weight?: number;
  }>;
}

interface GRPCRoute {
  spec?: {
    parentRefs?: Array<{
      name: string;
      namespace?: string;
      sectionName?: string;
    }>;
    hostnames?: string[];
    rules?: GRPCRule[];
  };
  status?: {
    parents?: Array<{
      parentRef: {
        name: string;
      };
      conditions?: Array<{
        type: string;
        status: string;
        reason?: string;
        message?: string;
      }>;
    }>;
  };
}

export const GRPCRouteAdapter: ResourceAdapter<GRPCRoute> = {
  kinds: ['GRPCRoute', 'GRPCRoutes'],

  adapt(_context: string, resource): ResourceSections {
    const spec = resource.spec;
    const status = resource.status;

    if (!spec) {
      return { sections: [] };
    }

    return {
      sections: [
        // Parent Gateways
        ...(spec.parentRefs && spec.parentRefs.length > 0
          ? [
              {
                id: 'parents',
                data: {
                  type: 'custom' as const,
                  render: () => (
                    <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                      <div className="text-xs text-neutral-600 dark:text-neutral-500 mb-1 flex items-center gap-1">
                        <Link size={10} /> Parent Gateway{spec.parentRefs!.length > 1 ? 's' : ''}
                      </div>
                      <div className="space-y-1">
                        {spec.parentRefs!.map((parent, idx) => {
                          const parentStatus = status?.parents?.find((p) => p.parentRef.name === parent.name);
                          const acceptedCond = parentStatus?.conditions?.find((c) => c.type === 'Accepted');
                          const isAccepted = acceptedCond?.status === 'True';
                          
                          return (
                            <div key={idx} className="text-sm flex items-center gap-2">
                              <span className="text-neutral-600 dark:text-neutral-500">Gateway:</span>
                              <span className="text-cyan-600 dark:text-cyan-400">{parent.name}</span>
                              {parent.namespace && (
                                <span className="text-xs text-neutral-600 dark:text-neutral-500">({parent.namespace})</span>
                              )}
                              <span
                                className={`text-xs px-1.5 py-0.5 rounded ${
                                  isAccepted
                                    ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                                    : 'bg-amber-500/20 text-amber-700 dark:text-amber-400'
                                }`}
                              >
                                {isAccepted ? 'Accepted' : acceptedCond?.reason || 'Unknown'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ),
                },
              },
            ]
          : []),

        ...(spec.hostnames && spec.hostnames.length > 0
          ? [
              {
                id: 'hostnames',
                data: {
                  type: 'custom' as const,
                  render: () => (
                    <div className="bg-neutral-100 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 rounded-lg p-3">
                      <div className="text-xs text-neutral-600 dark:text-neutral-500 mb-2">Hostnames</div>
                      <div className="flex flex-wrap gap-2">
                        {spec.hostnames!.map((hostname, idx) => (
                          <div
                            key={idx}
                            className="bg-cyan-500/10 border border-cyan-500/30 rounded px-2.5 py-1 text-sm text-cyan-600 dark:text-cyan-400 font-mono"
                          >
                            {hostname}
                          </div>
                        ))}
                      </div>
                    </div>
                  ),
                },
              },
            ]
          : []),

        ...(spec.rules && spec.rules.length > 0
          ? [
              {
                id: 'rules',
                title: 'Routing Rules',
                data: {
                  type: 'custom' as const,
                  render: () => (
                    <div className="space-y-2">
                      {spec.rules!.map((rule, idx) => (
                        <GRPCRuleCard key={rule.matches?.[0]?.method?.service || `rule-${idx}`} rule={rule} index={idx} />
                      ))}
                    </div>
                  ),
                },
              },
            ]
          : []),

        ...(status?.parents?.some((p) => p.conditions && p.conditions.length > 0)
          ? [
              {
                id: 'parent-conditions',
                title: 'Parent Status',
                data: {
                  type: 'conditions' as const,
                  items: status.parents.flatMap((parent) =>
                    (parent.conditions || []).map((condition) => ({
                      type: `${parent.parentRef.name}: ${condition.type}`,
                      status: condition.status,
                      reason: condition.reason,
                      message: condition.message,
                      description: getConditionDescription('GRPCRoute', condition.type, condition.status),
                    }))
                  ),
                },
              },
            ]
          : []),
      ],
    };
  },
};

// gRPC Rule Card Component
function GRPCRuleCard({ rule, index }: { rule: GRPCRule; index: number }) {
  const [expanded, setExpanded] = React.useState(false);
  
  const matchCount = rule.matches?.length || 0;
  const backendCount = rule.backendRefs?.length || 0;
  
  return (
    <div className="border border-indigo-500/30 bg-indigo-500/5 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-neutral-200/50 dark:hover:bg-neutral-800/30 transition-colors cursor-pointer"
      >
        <Network size={14} className="text-indigo-400" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
              Rule {index + 1}
            </span>
          </div>
          <div className="text-xs text-neutral-600 dark:text-neutral-500">
            {matchCount > 0 ? `${matchCount} match${matchCount !== 1 ? 'es' : ''}` : 'All methods'} • {backendCount} backend{backendCount !== 1 ? 's' : ''}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-neutral-200 dark:border-neutral-800 p-3 space-y-3">
          {rule.matches && rule.matches.length > 0 && (
            <div>
              <div className="text-xs text-neutral-600 dark:text-neutral-500 mb-1">gRPC Method Matches</div>
              <div className="space-y-2">
                {rule.matches.map((match, i) => (
                  <div key={i} className="text-xs bg-neutral-100 dark:bg-neutral-900/50 rounded p-2">
                    {match.method?.service && (
                      <div className="flex items-center gap-2 mb-1">
                        <Network size={10} className="text-purple-600 dark:text-purple-400" />
                        <span className="text-neutral-600 dark:text-neutral-400">Service:</span>
                        <span className="text-purple-600 dark:text-purple-400 font-mono">{match.method.service}</span>
                      </div>
                    )}
                    {match.method?.method && (
                      <div className="flex items-center gap-2">
                        <span className="text-neutral-600 dark:text-neutral-400 ml-4">Method:</span>
                        <span className="text-cyan-600 dark:text-cyan-400 font-mono">{match.method.method}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {rule.backendRefs && rule.backendRefs.length > 0 && (
            <div>
              <div className="text-xs text-neutral-600 dark:text-neutral-500 mb-1">Backend Services</div>
              <div className="space-y-2">
                {rule.backendRefs.map((backend, i) => (
                  <div key={i} className="text-xs bg-neutral-100 dark:bg-neutral-900/50 rounded p-2">
                    <div className="flex items-center gap-2">
                      <GitBranch size={10} className="text-emerald-600 dark:text-emerald-400" />
                      <span className="text-emerald-600 dark:text-emerald-400">{backend.name}</span>
                      {backend.port && (
                        <>
                          <span className="text-neutral-600 dark:text-neutral-500">:</span>
                          <span className="text-blue-600 dark:text-blue-400">{backend.port}</span>
                        </>
                      )}
                      {backend.weight !== undefined && (
                        <span className="ml-auto px-1 py-0.5 rounded bg-amber-500/20 text-amber-400 text-[10px]">
                          weight: {backend.weight}
                        </span>
                      )}
                    </div>
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
