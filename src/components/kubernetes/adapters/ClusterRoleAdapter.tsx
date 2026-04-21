// ClusterRole Adapter
// Extracts display data from Kubernetes ClusterRole resources with aggregation rule support
/* eslint-disable react-refresh/only-export-components */

import { useState, useEffect } from 'react';
import { Link } from '@tanstack/react-router';
import { Layers, AlertTriangle } from 'lucide-react';
import type { ResourceAdapter, ResourceSections, Section } from './types';
import { getResourceList, getResourceConfig } from '../../../api/kubernetes/kubernetes';

// Kubernetes ClusterRole type
interface V1ClusterRole {
  apiVersion?: string;
  kind?: string;
  metadata?: {
    name?: string;
    creationTimestamp?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  rules?: V1PolicyRule[];
  aggregationRule?: {
    clusterRoleSelectors?: Array<{
      matchLabels?: Record<string, string>;
      matchExpressions?: Array<{
        key: string;
        operator: string;
        values?: string[];
      }>;
    }>;
  };
}

interface V1PolicyRule {
  apiGroups?: string[];
  resources?: string[];
  verbs?: string[];
  resourceNames?: string[];
  nonResourceURLs?: string[];
}

// Dangerous verbs that can lead to privilege escalation
const DANGEROUS_VERBS = new Set(['*', 'delete', 'deletecollection', 'escalate', 'impersonate', 'bind']);

// Dangerous resources that grant broad access
const DANGEROUS_RESOURCES = new Set(['*', 'secrets', 'pods/exec', 'pods/attach', 'serviceaccounts/token']);

// Check if a rule is dangerous
function isRuleDangerous(rule: V1PolicyRule): boolean {
  const verbs = rule.verbs ?? [];
  const resources = rule.resources ?? [];
  const apiGroups = rule.apiGroups ?? [];
  
  // Wildcard verbs
  if (verbs.includes('*')) return true;
  
  // Dangerous verbs
  if (verbs.some(v => DANGEROUS_VERBS.has(v))) return true;
  
  // Wildcard resources
  if (resources.includes('*')) return true;
  
  // Wildcard API groups
  if (apiGroups.includes('*')) return true;
  
  // Dangerous resources
  if (resources.some(r => DANGEROUS_RESOURCES.has(r))) return true;
  
  // Create/update on certain resources
  if ((verbs.includes('create') || verbs.includes('update') || verbs.includes('patch')) &&
      resources.some(r => ['roles', 'clusterroles', 'rolebindings', 'clusterrolebindings'].includes(r))) {
    return true;
  }
  
  return false;
}

// Component to render RBAC rules table
function RulesTable({ rules, title }: { rules: V1PolicyRule[]; title?: string }) {
  if (!rules || rules.length === 0) {
    return (
      <div className="text-xs text-neutral-500 dark:text-neutral-500 italic">
        No rules defined
      </div>
    );
  }

  return (
    <div>
      {title && (
        <h5 className="text-xs font-medium text-neutral-600 dark:text-neutral-500 uppercase tracking-wider mb-2">{title}</h5>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-neutral-200 dark:border-neutral-700">
              <th className="text-left py-2 pr-4 font-medium text-neutral-600 dark:text-neutral-400">API Groups</th>
              <th className="text-left py-2 pr-4 font-medium text-neutral-600 dark:text-neutral-400">Resources</th>
              <th className="text-left py-2 pr-4 font-medium text-neutral-600 dark:text-neutral-400">Verbs</th>
              <th className="text-left py-2 font-medium text-neutral-600 dark:text-neutral-400">Resource Names</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule, index) => {
              const isDangerous = isRuleDangerous(rule);
              const textClass = isDangerous ? 'text-orange-500 dark:text-orange-400' : 'text-neutral-900 dark:text-neutral-100';
              
              return (
                <tr key={index} className="border-b border-neutral-100 dark:border-neutral-800 last:border-0">
                  <td className={`py-2 pr-4 font-mono ${textClass}`}>
                    {(rule.apiGroups ?? []).map(g => g === '' ? 'core' : g).join(', ') || '*'}
                  </td>
                  <td className={`py-2 pr-4 font-mono ${textClass}`}>
                    {(rule.resources ?? []).join(', ') || '-'}
                    {rule.nonResourceURLs && rule.nonResourceURLs.length > 0 && (
                      <span className="text-neutral-500"> (URLs: {rule.nonResourceURLs.join(', ')})</span>
                    )}
                  </td>
                  <td className={`py-2 pr-4 font-mono ${textClass}`}>
                    {(rule.verbs ?? []).join(', ')}
                  </td>
                  <td className={`py-2 font-mono ${textClass}`}>
                    {rule.resourceNames && rule.resourceNames.length > 0 
                      ? rule.resourceNames.join(', ')
                      : <span className="text-neutral-500 dark:text-neutral-600">all</span>
                    }
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Component to show aggregated ClusterRoles
interface AggregatedClusterRole {
  name: string;
  rules: V1PolicyRule[];
  context: string;
}

function AggregatedRolesSection({ 
  loader,
  context,
}: { 
  loader: () => Promise<AggregatedClusterRole[]>;
  context: string;
}) {
  const [roles, setRoles] = useState<AggregatedClusterRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loader()
      .then(setRoles)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [loader]);

  if (loading) {
    return (
      <div className="text-xs text-neutral-500">Loading aggregated roles...</div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-xs text-red-500">
        <AlertTriangle size={14} />
        Failed to load aggregated roles: {error}
      </div>
    );
  }

  if (roles.length === 0) {
    return (
      <div className="text-xs text-neutral-500 italic">
        No matching ClusterRoles found for aggregation
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-xs text-neutral-600 dark:text-neutral-400">
        Aggregated from {roles.length} ClusterRole{roles.length !== 1 ? 's' : ''}:
      </div>
      <div className="space-y-3">
        {roles.map(role => (
          <div key={role.name} className="border border-neutral-200 dark:border-neutral-700 rounded-lg p-3">
            <Link
              to="/cluster/$context/$resourceType/$name"
              params={{ context, resourceType: 'clusterroles', name: role.name }}
              className="flex items-center gap-2 text-sm font-medium text-blue-500 hover:text-blue-400 mb-2"
            >
              <Layers size={14} />
              {role.name}
            </Link>
            {role.rules && role.rules.length > 0 ? (
              <RulesTable rules={role.rules} />
            ) : (
              <div className="text-xs text-neutral-500 italic">No rules</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export const ClusterRoleAdapter: ResourceAdapter<V1ClusterRole> = {
  kinds: ['ClusterRole', 'ClusterRoles'],

  adapt(context: string, resource: V1ClusterRole): ResourceSections {
    const sections: Section[] = [];
    const rules = resource.rules ?? [];
    const aggregationRule = resource.aggregationRule;
    const isAggregated = aggregationRule && aggregationRule.clusterRoleSelectors && aggregationRule.clusterRoleSelectors.length > 0;

    // Check if any rule is dangerous
    const hasDangerousRules = rules.some(isRuleDangerous);

    // Status cards
    const statusItems: Array<{ label: string; value: string | number; status?: 'success' | 'warning' | 'error' | 'neutral' }> = [
      { label: 'Rules', value: rules.length },
      { 
        label: 'Risk Level', 
        value: hasDangerousRules ? 'Elevated' : 'Normal',
        status: hasDangerousRules ? 'warning' : 'success'
      },
    ];

    if (isAggregated) {
      statusItems.push({ label: 'Type', value: 'Aggregated', status: 'neutral' });
    }

    sections.push({
      id: 'status',
      data: {
        type: 'status-cards',
        items: statusItems,
      },
    });

    // Aggregation rule section
    if (isAggregated) {
      const selectors = aggregationRule.clusterRoleSelectors!;
      
      // Build label selector description
      const selectorDescriptions = selectors.map(sel => {
        const parts: string[] = [];
        if (sel.matchLabels) {
          parts.push(...Object.entries(sel.matchLabels).map(([k, v]) => `${k}=${v}`));
        }
        if (sel.matchExpressions) {
          parts.push(...sel.matchExpressions.map(expr => 
            `${expr.key} ${expr.operator} ${expr.values?.join(', ') ?? ''}`
          ));
        }
        return parts.join(', ');
      });

      sections.push({
        id: 'aggregation-info',
        title: 'Aggregation Rule',
        data: {
          type: 'info-grid',
          columns: 1,
          items: selectorDescriptions.map((desc, i) => ({
            label: `Selector ${i + 1}`,
            value: desc,
          })),
        },
      });

      // Fetch and display aggregated ClusterRoles
      const loader = async (): Promise<AggregatedClusterRole[]> => {
        const config = await getResourceConfig(context, 'clusterroles');
        if (!config) return [];

        const allClusterRoles = await getResourceList(context, config);
        const matchingRoles: AggregatedClusterRole[] = [];

        for (const item of allClusterRoles) {
          const cr = item as unknown as V1ClusterRole;
          const crLabels = cr.metadata?.labels ?? {};
          
          // Check if this ClusterRole matches any selector
          const matches = selectors.some(sel => {
            // Check matchLabels
            if (sel.matchLabels) {
              for (const [key, value] of Object.entries(sel.matchLabels)) {
                if (crLabels[key] !== value) return false;
              }
            }
            // Check matchExpressions
            if (sel.matchExpressions) {
              for (const expr of sel.matchExpressions) {
                const labelValue = crLabels[expr.key];
                switch (expr.operator) {
                  case 'In':
                    if (!expr.values?.includes(labelValue)) return false;
                    break;
                  case 'NotIn':
                    if (expr.values?.includes(labelValue)) return false;
                    break;
                  case 'Exists':
                    if (!(expr.key in crLabels)) return false;
                    break;
                  case 'DoesNotExist':
                    if (expr.key in crLabels) return false;
                    break;
                }
              }
            }
            return true;
          });

          if (matches && cr.metadata?.name !== resource.metadata?.name) {
            matchingRoles.push({
              name: cr.metadata?.name ?? 'Unknown',
              rules: cr.rules ?? [],
              context,
            });
          }
        }

        return matchingRoles;
      };

      sections.push({
        id: 'aggregated-roles',
        title: 'Aggregated ClusterRoles',
        data: {
          type: 'custom',
          render: () => <AggregatedRolesSection loader={loader} context={context} />,
        },
      });
    }

    // Rules table (direct rules)
    if (rules.length > 0 || !isAggregated) {
      sections.push({
        id: 'rules',
        title: isAggregated ? 'Direct Rules' : 'Permission Rules',
        data: {
          type: 'custom',
          render: () => <RulesTable rules={rules} />,
        },
      });
    }

    return { sections };
  },
};
