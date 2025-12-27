// Service Adapter (v1)
// Extracts display data from Kubernetes Service resources

import { Globe, Network, Server, ExternalLink, Lock } from 'lucide-react';
import type { ResourceAdapter, ResourceSections, Section, StatusLevel } from './types';
import type { V1Service } from '@kubernetes/client-node';

// Get service type display info
function getServiceTypeInfo(type?: string): { label: string; status: StatusLevel; icon: React.ReactNode } {
  switch (type) {
    case 'LoadBalancer':
      return { 
        label: 'LoadBalancer', 
        status: 'success', 
        icon: <Globe size={14} className="text-emerald-400" /> 
      };
    case 'NodePort':
      return { 
        label: 'NodePort', 
        status: 'warning', 
        icon: <Server size={14} className="text-amber-400" /> 
      };
    case 'ExternalName':
      return { 
        label: 'ExternalName', 
        status: 'neutral', 
        icon: <ExternalLink size={14} className="text-purple-400" /> 
      };
    case 'ClusterIP':
    default:
      return { 
        label: type || 'ClusterIP', 
        status: 'neutral', 
        icon: <Network size={14} className="text-blue-400" /> 
      };
  }
}

export const ServiceAdapter: ResourceAdapter<V1Service> = {
  kinds: ['Service', 'Services'],

  adapt(resource): ResourceSections {
    const spec = resource.spec;
    const status = resource.status;

    if (!spec) {
      return { sections: [] };
    }

    const typeInfo = getServiceTypeInfo(spec.type);
    const hasLoadBalancer = spec.type === 'LoadBalancer';
    const loadBalancerIngress = status?.loadBalancer?.ingress;
    const hasExternalAccess = hasLoadBalancer && loadBalancerIngress && loadBalancerIngress.length > 0;

    const sections: Section[] = [
      // Service type and cluster IP
      {
        id: 'status',
        data: {
          type: 'status-cards',
          items: [
            {
              label: 'Type',
              value: typeInfo.label,
              status: typeInfo.status,
              icon: typeInfo.icon,
            },
            ...(spec.clusterIP && spec.clusterIP !== 'None' ? [{
              label: 'Cluster IP',
              value: spec.clusterIP,
              status: 'neutral' as const,
              icon: <Network size={14} className="text-blue-400" />,
            }] : []),
            ...(spec.clusterIP === 'None' ? [{
              label: 'Cluster IP',
              value: 'Headless',
              status: 'neutral' as const,
              icon: <Network size={14} className="text-neutral-400" />,
            }] : []),
            ...(spec.externalName ? [{
              label: 'External Name',
              value: spec.externalName,
              status: 'neutral' as const,
              icon: <ExternalLink size={14} className="text-purple-400" />,
            }] : []),
          ],
        },
      },
    ];

    // Ports
    if (spec.ports && spec.ports.length > 0) {
      sections.push({
        id: 'ports',
        title: 'Ports',
        data: {
          type: 'custom',
          render: () => (
            <div className="bg-neutral-100 dark:bg-neutral-800/50 rounded-lg p-4">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-neutral-200 dark:border-neutral-700">
                    <th className="pb-2 text-left text-neutral-500 font-medium">Name</th>
                    <th className="pb-2 text-left text-neutral-500 font-medium">Protocol</th>
                    <th className="pb-2 text-right text-neutral-500 font-medium">Port</th>
                    <th className="pb-2 text-right text-neutral-500 font-medium">Target</th>
                    <th className="pb-2 text-right text-neutral-500 font-medium">NodePort</th>
                  </tr>
                </thead>
                <tbody>
                  {spec.ports!.map((port, i) => (
                    <tr key={i} className="border-b border-neutral-200 dark:border-neutral-700/50 last:border-0">
                      <td className="py-2 text-neutral-900 dark:text-neutral-300">
                        {port.name || <span className="text-neutral-400 italic">unnamed</span>}
                      </td>
                      <td className="py-2">
                        <span className="text-xs px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400">
                          {port.protocol || 'TCP'}
                        </span>
                      </td>
                      <td className="py-2 text-right font-mono text-neutral-700 dark:text-neutral-300">
                        {port.port}
                      </td>
                      <td className="py-2 text-right font-mono text-neutral-700 dark:text-neutral-300">
                        {port.targetPort || <span className="text-neutral-400">—</span>}
                      </td>
                      <td className="py-2 text-right font-mono text-amber-500 dark:text-amber-400">
                        {port.nodePort || <span className="text-neutral-400">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ),
        },
      });
    }

    // Load Balancer Ingress
    if (hasLoadBalancer) {
      sections.push({
        id: 'loadbalancer',
        title: 'Load Balancer',
        data: {
          type: 'custom',
          render: () => (
            <div className={`rounded-lg p-3 border ${
              hasExternalAccess 
                ? 'bg-emerald-500/10 border-emerald-500/30' 
                : 'bg-amber-500/10 border-amber-500/30'
            }`}>
              {hasExternalAccess ? (
                <div className="space-y-2">
                  {loadBalancerIngress!.map((ingress, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Globe size={14} className="text-emerald-400" />
                      <span className="text-sm font-mono text-emerald-300">
                        {ingress.ip || ingress.hostname || 'N/A'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-amber-400">
                  <Globe size={14} />
                  <span className="text-sm">Pending external IP assignment...</span>
                </div>
              )}
            </div>
          ),
        },
      });
    }

    // External IPs
    if (spec.externalIPs && spec.externalIPs.length > 0) {
      sections.push({
        id: 'external-ips',
        title: 'External IPs',
        data: {
          type: 'custom',
          render: () => (
            <div className="flex flex-wrap gap-2">
              {spec.externalIPs!.map((ip, i) => (
                <span
                  key={i}
                  className="text-xs px-2 py-1 rounded bg-purple-500/20 text-purple-300 font-mono"
                >
                  {ip}
                </span>
              ))}
            </div>
          ),
        },
      });
    }

    // Selector
    if (spec.selector && Object.keys(spec.selector).length > 0) {
      sections.push({
        id: 'selector',
        data: {
          type: 'labels' as const,
          labels: spec.selector,
          title: 'Selector',
        },
      });
    }

    // Traffic Policy & Session Affinity
    const hasTrafficConfig = spec.externalTrafficPolicy || spec.internalTrafficPolicy || 
                             spec.sessionAffinity !== 'None';
    if (hasTrafficConfig) {
      sections.push({
        id: 'traffic',
        title: 'Traffic Configuration',
        data: {
          type: 'info-grid',
          columns: 2,
          items: [
            ...(spec.externalTrafficPolicy ? [{ 
              label: 'External Traffic', 
              value: spec.externalTrafficPolicy,
              color: spec.externalTrafficPolicy === 'Local' ? 'text-amber-400' : undefined,
            }] : []),
            ...(spec.internalTrafficPolicy ? [{ 
              label: 'Internal Traffic', 
              value: spec.internalTrafficPolicy,
            }] : []),
            ...(spec.sessionAffinity && spec.sessionAffinity !== 'None' ? [{ 
              label: 'Session Affinity', 
              value: spec.sessionAffinity,
              color: 'text-purple-400',
            }] : []),
            ...(spec.sessionAffinityConfig?.clientIP?.timeoutSeconds ? [{ 
              label: 'Affinity Timeout', 
              value: `${spec.sessionAffinityConfig.clientIP.timeoutSeconds}s`,
            }] : []),
            ...(spec.healthCheckNodePort ? [{ 
              label: 'Health Check Port', 
              value: spec.healthCheckNodePort,
            }] : []),
          ],
        },
      });
    }

    // Load Balancer Configuration
    if (hasLoadBalancer && (spec.loadBalancerIP || spec.loadBalancerSourceRanges?.length || spec.loadBalancerClass)) {
      sections.push({
        id: 'lb-config',
        title: 'Load Balancer Configuration',
        data: {
          type: 'custom',
          render: () => (
            <div className="space-y-2">
              {spec.loadBalancerIP && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-neutral-500">Requested IP:</span>
                  <span className="text-neutral-300 font-mono">{spec.loadBalancerIP}</span>
                </div>
              )}
              {spec.loadBalancerClass && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-neutral-500">Class:</span>
                  <span className="text-neutral-300">{spec.loadBalancerClass}</span>
                </div>
              )}
              {spec.loadBalancerSourceRanges && spec.loadBalancerSourceRanges.length > 0 && (
                <div className="text-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <Lock size={14} className="text-neutral-500" />
                    <span className="text-neutral-500">Source Ranges:</span>
                  </div>
                  <div className="flex flex-wrap gap-1 ml-5">
                    {spec.loadBalancerSourceRanges.map((range, i) => (
                      <span
                        key={i}
                        className="text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono"
                      >
                        {range}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {spec.allocateLoadBalancerNodePorts === false && (
                <div className="text-xs text-neutral-500">
                  NodePort allocation disabled
                </div>
              )}
            </div>
          ),
        },
      });
    }

    // Conditions (for Gateway API services)
    if (status?.conditions && status.conditions.length > 0) {
      sections.push({
        id: 'conditions',
        title: 'Conditions',
        data: {
          type: 'conditions',
          items: status.conditions.map(c => ({
            type: c.type,
            status: c.status,
            reason: c.reason,
            message: c.message,
          })),
        },
      });
    }

    return { sections };
  },
};
