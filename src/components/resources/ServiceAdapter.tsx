// Service Adapter (v1)
// Extracts display data from Kubernetes Service resources

import { Globe, Network, Server, ExternalLink, Lock, Tag } from 'lucide-react';
import type { ResourceAdapter, ResourceSections, Section, StatusLevel } from './types';

// Service types
interface ServicePort {
  name?: string;
  protocol?: string;
  port: number;
  targetPort?: number | string;
  nodePort?: number;
  appProtocol?: string;
}

interface ServiceSpec {
  type?: string;
  clusterIP?: string;
  clusterIPs?: string[];
  externalIPs?: string[];
  externalName?: string;
  externalTrafficPolicy?: string;
  internalTrafficPolicy?: string;
  healthCheckNodePort?: number;
  ipFamilies?: string[];
  ipFamilyPolicy?: string;
  loadBalancerIP?: string;
  loadBalancerSourceRanges?: string[];
  loadBalancerClass?: string;
  ports?: ServicePort[];
  publishNotReadyAddresses?: boolean;
  selector?: Record<string, string>;
  sessionAffinity?: string;
  sessionAffinityConfig?: {
    clientIP?: {
      timeoutSeconds?: number;
    };
  };
  allocateLoadBalancerNodePorts?: boolean;
}

interface LoadBalancerIngress {
  ip?: string;
  hostname?: string;
  ports?: Array<{
    port: number;
    protocol?: string;
    error?: string;
  }>;
}

interface ServiceStatus {
  loadBalancer?: {
    ingress?: LoadBalancerIngress[];
  };
  conditions?: Array<{
    type: string;
    status: string;
    reason?: string;
    message?: string;
    lastTransitionTime?: string;
  }>;
}

interface Service {
  apiVersion?: string;
  kind?: string;
  metadata?: {
    name?: string;
    namespace?: string;
    uid?: string;
    creationTimestamp?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  spec?: ServiceSpec;
  status?: ServiceStatus;
}

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

export const ServiceAdapter: ResourceAdapter<Service> = {
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
            <div className="space-y-2">
              {spec.ports!.map((port, i) => (
                <div
                  key={i}
                  className="bg-neutral-900/50 border border-neutral-700 rounded-lg p-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {port.name && (
                        <span className="text-sm font-medium text-cyan-400">{port.name}</span>
                      )}
                      {!port.name && (
                        <span className="text-sm text-neutral-500">unnamed</span>
                      )}
                      {port.appProtocol && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
                          {port.appProtocol}
                        </span>
                      )}
                    </div>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-neutral-700 text-neutral-400">
                      {port.protocol || 'TCP'}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-4 text-sm">
                    <div>
                      <span className="text-neutral-500">Port: </span>
                      <span className="text-neutral-300 font-mono">{port.port}</span>
                    </div>
                    {port.targetPort && (
                      <div>
                        <span className="text-neutral-500">Target: </span>
                        <span className="text-neutral-300 font-mono">{port.targetPort}</span>
                      </div>
                    )}
                    {port.nodePort && (
                      <div>
                        <span className="text-neutral-500">NodePort: </span>
                        <span className="text-amber-400 font-mono">{port.nodePort}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
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
        title: 'Selector',
        data: {
          type: 'custom',
          render: () => (
            <div className="bg-neutral-900/50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Tag size={14} className="text-neutral-400" />
                <span className="text-sm font-medium text-neutral-300">Pod Selector</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(spec.selector!).map(([key, value]) => (
                  <span
                    key={key}
                    className="text-xs px-2 py-1 rounded bg-blue-500/20 text-blue-300"
                  >
                    {key}={value}
                  </span>
                ))}
              </div>
            </div>
          ),
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

    // IP Configuration
    const hasIPConfig = (spec.ipFamilies && spec.ipFamilies.length > 0) || 
                        spec.ipFamilyPolicy ||
                        (spec.clusterIPs && spec.clusterIPs.length > 1);
    if (hasIPConfig) {
      sections.push({
        id: 'ip-config',
        title: 'IP Configuration',
        data: {
          type: 'custom',
          render: () => (
            <div className="space-y-2">
              {spec.ipFamilies && spec.ipFamilies.length > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-neutral-500">IP Families:</span>
                  <div className="flex gap-1">
                    {spec.ipFamilies.map((family, i) => (
                      <span
                        key={i}
                        className="text-xs px-1.5 py-0.5 rounded bg-neutral-700 text-neutral-300"
                      >
                        {family}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {spec.ipFamilyPolicy && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-neutral-500">Policy:</span>
                  <span className="text-neutral-300">{spec.ipFamilyPolicy}</span>
                </div>
              )}
              {spec.clusterIPs && spec.clusterIPs.length > 1 && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-neutral-500">Cluster IPs:</span>
                  <div className="flex flex-wrap gap-1">
                    {spec.clusterIPs.map((ip, i) => (
                      <span
                        key={i}
                        className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono"
                      >
                        {ip}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ),
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
            isPositive: c.status === 'True',
          })),
        },
      });
    }

    return { sections };
  },
};
