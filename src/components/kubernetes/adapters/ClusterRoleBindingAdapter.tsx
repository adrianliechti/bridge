// ClusterRoleBinding Adapter
// Extracts display data from Kubernetes ClusterRoleBinding resources
/* eslint-disable react-refresh/only-export-components */

import { useState, useEffect } from 'react';
import { Link } from '@tanstack/react-router';
import { Shield, User, Users, Bot, AlertTriangle } from 'lucide-react';
import type { ResourceAdapter, ResourceSections, Section } from './types';
import { getResource, getResourceConfig } from '../../../api/kubernetes/kubernetes';

// Kubernetes ClusterRoleBinding type
interface V1ClusterRoleBinding {
  apiVersion?: string;
  kind?: string;
  metadata?: {
    name?: string;
    creationTimestamp?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  roleRef: {
    apiGroup: string;
    kind: 'ClusterRole';
    name: string;
  };
  subjects?: V1Subject[];
}

interface V1Subject {
  kind: 'User' | 'Group' | 'ServiceAccount';
  name: string;
  namespace?: string;
  apiGroup?: string;
}

interface V1PolicyRule {
  apiGroups?: string[];
  resources?: string[];
  verbs?: string[];
  resourceNames?: string[];
  nonResourceURLs?: string[];
}

// Dangerous verbs that can lead to privilege escalation
const DANGEROUS_VERBS = new Set([
  '*',
  'delete',
  'deletecollection',
  'escalate',
  'impersonate',
  'bind',
]);
const DANGEROUS_RESOURCES = new Set([
  '*',
  'secrets',
  'pods/exec',
  'pods/attach',
  'serviceaccounts/token',
]);

function isRuleDangerous(rule: V1PolicyRule): boolean {
  const verbs = rule.verbs ?? [];
  const resources = rule.resources ?? [];
  const apiGroups = rule.apiGroups ?? [];

  if (verbs.includes('*')) return true;
  if (verbs.some((v) => DANGEROUS_VERBS.has(v))) return true;
  if (resources.includes('*')) return true;
  if (apiGroups.includes('*')) return true;
  if (resources.some((r) => DANGEROUS_RESOURCES.has(r))) return true;
  if (
    (verbs.includes('create') || verbs.includes('update') || verbs.includes('patch')) &&
    resources.some((r) =>
      ['roles', 'clusterroles', 'rolebindings', 'clusterrolebindings'].includes(r),
    )
  ) {
    return true;
  }
  return false;
}

// Component to render subjects table
function SubjectsTable({ subjects, context }: { subjects: V1Subject[]; context: string }) {
  if (subjects.length === 0) {
    return (
      <div className="text-xs text-neutral-500 dark:text-neutral-500 italic">
        No subjects defined
      </div>
    );
  }

  const getSubjectIcon = (kind: string) => {
    switch (kind) {
      case 'User':
        return <User size={14} className="text-blue-500" />;
      case 'Group':
        return <Users size={14} className="text-purple-500" />;
      case 'ServiceAccount':
        return <Bot size={14} className="text-emerald-500" />;
      default:
        return <User size={14} className="text-neutral-500" />;
    }
  };

  return (
    <div className="space-y-2">
      {subjects.map((subject, index) => {
        const isServiceAccount = subject.kind === 'ServiceAccount';

        const content = (
          <div
            className={`flex items-center gap-3 p-2 rounded-lg bg-neutral-100 dark:bg-neutral-800/50 ${
              isServiceAccount && subject.namespace
                ? 'hover:bg-neutral-200 dark:hover:bg-neutral-700/50 cursor-pointer transition-colors'
                : ''
            }`}
          >
            {getSubjectIcon(subject.kind)}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                {subject.name}
              </div>
              <div className="text-xs text-neutral-500">
                {subject.kind}
                {subject.namespace && <span className="ml-1">• {subject.namespace}</span>}
              </div>
            </div>
          </div>
        );

        // Make ServiceAccounts clickable (requires namespace)
        if (isServiceAccount && subject.namespace) {
          return (
            <Link
              key={index}
              to="/cluster/$context/$resourceType/$name"
              params={{ context, resourceType: 'serviceaccounts', name: subject.name }}
              search={(prev) => ({ ...prev, namespace: subject.namespace })}
            >
              {content}
            </Link>
          );
        }

        return <div key={index}>{content}</div>;
      })}
    </div>
  );
}

// Component to render ClusterRole reference with permissions
function ClusterRoleRefSection({
  roleRef,
  context,
}: {
  roleRef: V1ClusterRoleBinding['roleRef'];
  context: string;
}) {
  const [rules, setRules] = useState<V1PolicyRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchRole = async () => {
      try {
        const config = await getResourceConfig(context, 'clusterroles');
        if (!config) {
          setError('Could not find ClusterRole configuration');
          return;
        }

        const role = await getResource(context, config, roleRef.name);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setRules((role as any).rules ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch ClusterRole');
      } finally {
        setLoading(false);
      }
    };

    fetchRole();
  }, [roleRef, context]);

  return (
    <div className="space-y-3">
      <Link
        to="/cluster/$context/$resourceType/$name"
        params={{ context, resourceType: 'clusterroles', name: roleRef.name }}
        className="flex items-center gap-2 text-sm font-medium text-blue-500 hover:text-blue-400 transition-colors"
      >
        <Shield size={16} />
        {roleRef.name}
        <span className="text-xs text-neutral-500 font-normal">(ClusterRole)</span>
      </Link>

      {loading && <div className="text-xs text-neutral-500">Loading permissions...</div>}

      {error && (
        <div className="flex items-center gap-2 text-xs text-red-500">
          <AlertTriangle size={14} />
          {error}
        </div>
      )}

      {!loading && !error && rules.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-700">
                <th className="text-left py-2 pr-4 font-medium text-neutral-600 dark:text-neutral-400">
                  API Groups
                </th>
                <th className="text-left py-2 pr-4 font-medium text-neutral-600 dark:text-neutral-400">
                  Resources
                </th>
                <th className="text-left py-2 pr-4 font-medium text-neutral-600 dark:text-neutral-400">
                  Verbs
                </th>
                <th className="text-left py-2 font-medium text-neutral-600 dark:text-neutral-400">
                  Resource Names
                </th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule, index) => {
                const isDangerous = isRuleDangerous(rule);
                const textClass = isDangerous
                  ? 'text-orange-500 dark:text-orange-400'
                  : 'text-neutral-900 dark:text-neutral-100';

                return (
                  <tr
                    key={index}
                    className="border-b border-neutral-100 dark:border-neutral-800 last:border-0"
                  >
                    <td className={`py-2 pr-4 font-mono ${textClass}`}>
                      {(rule.apiGroups ?? []).map((g) => (g === '' ? 'core' : g)).join(', ') || '*'}
                    </td>
                    <td className={`py-2 pr-4 font-mono ${textClass}`}>
                      {(rule.resources ?? []).join(', ') || '-'}
                    </td>
                    <td className={`py-2 pr-4 font-mono ${textClass}`}>
                      {(rule.verbs ?? []).join(', ')}
                    </td>
                    <td className={`py-2 font-mono ${textClass}`}>
                      {rule.resourceNames && rule.resourceNames.length > 0 ? (
                        rule.resourceNames.join(', ')
                      ) : (
                        <span className="text-neutral-500 dark:text-neutral-600">all</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && rules.length === 0 && (
        <div className="text-xs text-neutral-500 italic">No rules defined in this ClusterRole</div>
      )}
    </div>
  );
}

export const ClusterRoleBindingAdapter: ResourceAdapter<V1ClusterRoleBinding> = {
  kinds: ['ClusterRoleBinding', 'ClusterRoleBindings'],

  adapt(context: string, resource: V1ClusterRoleBinding): ResourceSections {
    const sections: Section[] = [];
    const subjects = resource.subjects ?? [];

    // Status cards
    sections.push({
      id: 'status',
      data: {
        type: 'status-cards',
        items: [
          { label: 'Scope', value: 'Cluster-wide' },
          { label: 'Subjects', value: subjects.length },
        ],
      },
    });

    // ClusterRole Reference with permissions
    sections.push({
      id: 'roleRef',
      title: 'ClusterRole Reference',
      data: {
        type: 'custom',
        render: () => <ClusterRoleRefSection roleRef={resource.roleRef} context={context} />,
      },
    });

    // Subjects table
    sections.push({
      id: 'subjects',
      title: 'Subjects',
      data: {
        type: 'custom',
        render: () => <SubjectsTable subjects={subjects} context={context} />,
      },
    });

    return { sections };
  },
};
