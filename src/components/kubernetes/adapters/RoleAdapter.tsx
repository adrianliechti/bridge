// Role Adapter
// Extracts display data from Kubernetes Role resources
/* eslint-disable react-refresh/only-export-components */

import type { ResourceAdapter, ResourceSections, Section } from './types';

// Kubernetes Role type
interface V1Role {
  apiVersion?: string;
  kind?: string;
  metadata?: {
    name?: string;
    namespace?: string;
    creationTimestamp?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  rules?: V1PolicyRule[];
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
function RulesTable({ rules }: { rules: V1PolicyRule[] }) {
  if (rules.length === 0) {
    return (
      <div className="text-xs text-neutral-500 dark:text-neutral-500 italic">
        No rules defined
      </div>
    );
  }

  return (
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
  );
}

export const RoleAdapter: ResourceAdapter<V1Role> = {
  kinds: ['Role', 'Roles'],

  adapt(_context: string, resource: V1Role): ResourceSections {
    const sections: Section[] = [];
    const rules = resource.rules ?? [];

    // Check if any rule is dangerous
    const hasDangerousRules = rules.some(isRuleDangerous);

    // Status cards
    sections.push({
      id: 'status',
      data: {
        type: 'status-cards',
        items: [
          { label: 'Rules', value: rules.length },
          { 
            label: 'Risk Level', 
            value: hasDangerousRules ? 'Elevated' : 'Normal',
            status: hasDangerousRules ? 'warning' : 'success'
          },
        ],
      },
    });

    // Rules table
    sections.push({
      id: 'rules',
      title: 'Permission Rules',
      data: {
        type: 'custom',
        render: () => <RulesTable rules={rules} />,
      },
    });

    return { sections };
  },
};
