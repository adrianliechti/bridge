/* eslint-disable react-refresh/only-export-components */
// Ingress Adapter
// Extracts display data from Ingress v1 resources

import React from 'react';
import { ChevronDown, ChevronRight, Network, Route, KeyRound, Globe } from 'lucide-react';
import type { ResourceAdapter, ResourceSections } from './types';
import type { V1Ingress, V1IngressRule, V1IngressTLS, V1HTTPIngressPath } from '@kubernetes/client-node';

export const IngressAdapter: ResourceAdapter<V1Ingress> = {
  kinds: ['Ingress', 'Ingresses'],

  adapt(resource): ResourceSections {
    const spec = resource.spec;
    const status = resource.status;

    if (!spec) {
      return { sections: [] };
    }

    const hasLoadBalancer = status?.loadBalancer?.ingress && status.loadBalancer.ingress.length > 0;

    return {
      sections: [
        {
          id: 'status',
          title: 'Ingress Status',
          data: {
            type: 'status-cards',
            items: [
              {
                label: 'Ingress Class',
                value: spec.ingressClassName || 'default',
                status: 'neutral' as const,
              },
              {
                label: 'Load Balancer',
                value: hasLoadBalancer ? 'Ready' : 'Pending',
                status: hasLoadBalancer ? ('success' as const) : ('warning' as const),
              },
            ],
          },
        },

        ...(hasLoadBalancer
          ? [
              {
                id: 'load-balancer',
                title: 'Load Balancer',
                data: {
                  type: 'info-grid' as const,
                  items: (status?.loadBalancer?.ingress || []).map((lb) => ({
                    label: lb.hostname ? 'Hostname' : 'IP Address',
                    value: lb.hostname || lb.ip || 'Unknown',
                    color: 'text-blue-400',
                  })),
                  columns: 2 as const,
                },
              },
            ]
          : []),

        ...(spec.tls && spec.tls.length > 0
          ? [
              {
                id: 'tls',
                title: 'TLS Configuration',
                data: {
                  type: 'custom' as const,
                  render: () => (
                    <div className="space-y-2">
                      {spec.tls!.map((tls, idx) => (
                        <TLSCard key={tls.secretName || `tls-${idx}`} tls={tls} index={idx} />
                      ))}
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
                        <RuleCard key={rule.host || `rule-${idx}`} rule={rule} index={idx} />
                      ))}
                    </div>
                  ),
                },
              },
            ]
          : []),

        ...(spec.defaultBackend?.service
          ? [
              {
                id: 'default-backend',
                title: 'Default Backend',
                data: {
                  type: 'info-grid' as const,
                  items: [
                    {
                      label: 'Service',
                      value: spec.defaultBackend.service.name,
                    },
                    {
                      label: 'Port',
                      value: String(
                        spec.defaultBackend.service.port?.number ||
                          spec.defaultBackend.service.port?.name ||
                          'unknown'
                      ),
                    },
                  ],
                  columns: 2 as const,
                },
              },
            ]
          : []),
      ],
    };
  },
};

// Rule Card Component
function RuleCard({ rule, index }: { rule: V1IngressRule; index: number }) {
  const [expanded, setExpanded] = React.useState(false);
  
  return (
    <div className="border border-blue-500/30 bg-blue-500/5 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-neutral-800/30 transition-colors"
      >
        {expanded ? (
          <ChevronDown size={14} className="text-neutral-500" />
        ) : (
          <ChevronRight size={14} className="text-neutral-500" />
        )}
        <Network size={14} className="text-blue-400" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-neutral-100">
              {rule.host || `Rule ${index + 1}`}
            </span>
          </div>
          <div className="text-xs text-neutral-500">
            {rule.http?.paths.length || 0} path{rule.http?.paths.length !== 1 ? 's' : ''}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-neutral-800 p-3 space-y-3">
          {rule.host && (
            <div>
              <div className="text-xs text-neutral-500 mb-1">Host</div>
              <div className="text-xs text-cyan-400">{rule.host}</div>
            </div>
          )}

          {rule.http?.paths && rule.http.paths.length > 0 && (
            <div>
              <div className="text-xs text-neutral-500 mb-1">Paths</div>
              <div className="space-y-2">
                {rule.http.paths.map((path: V1HTTPIngressPath, i: number) => {
                  const port = path.backend.service?.port?.number || path.backend.service?.port?.name || '';
                  return (
                    <div key={i} className="text-xs bg-neutral-900/50 rounded p-2">
                      <div className="flex items-center gap-2 mb-1">
                        <Route size={10} className="text-purple-400" />
                        <span className="text-neutral-300 font-mono">{path.path || '/'}</span>
                        <span className="px-1 py-0.5 rounded bg-purple-500/20 text-purple-400 text-[10px]">
                          {path.pathType}
                        </span>
                      </div>
                      <div className="ml-4 flex items-center gap-2">
                        <span className="text-neutral-600">→</span>
                        <span className="text-emerald-400">{path.backend.service?.name || 'unknown'}</span>
                        <span className="text-neutral-600">:</span>
                        <span className="text-blue-400">{port}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// TLS Card Component
function TLSCard({ tls, index }: { tls: V1IngressTLS; index: number }) {
  const [expanded, setExpanded] = React.useState(false);
  
  return (
    <div className="border border-amber-500/30 bg-amber-500/5 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-neutral-800/30 transition-colors"
      >
        {expanded ? (
          <ChevronDown size={14} className="text-neutral-500" />
        ) : (
          <ChevronRight size={14} className="text-neutral-500" />
        )}
        <KeyRound size={14} className="text-amber-400" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-neutral-100">
              {tls.secretName || `TLS ${index + 1}`}
            </span>
          </div>
          <div className="text-xs text-neutral-500 truncate">
            {tls.hosts?.join(', ') || 'All hosts'}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-neutral-800 p-3 space-y-3">
          <div>
            <div className="text-xs text-neutral-500 mb-1">Secret</div>
            <div className="text-xs text-purple-400">{tls.secretName || 'default'}</div>
          </div>

          {tls.hosts && tls.hosts.length > 0 && (
            <div>
              <div className="text-xs text-neutral-500 mb-1">Hosts</div>
              <div className="space-y-1">
                {tls.hosts.map((host: string, i: number) => (
                  <div key={i} className="text-xs bg-neutral-900/50 rounded p-2">
                    <div className="flex items-center gap-2">
                      <Globe size={10} className="text-cyan-400" />
                      <span className="text-cyan-400">{host}</span>
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
