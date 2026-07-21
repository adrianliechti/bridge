// ServiceAccount Adapter
// Extracts display data from Kubernetes ServiceAccount resources

import type { ResourceAdapter, ResourceSections, Section, RoleBindingData } from './types';
import { getResourceList, getResourceConfig } from '../../../api/kubernetes/kubernetes';

// Kubernetes ServiceAccount type
interface V1ServiceAccount {
  apiVersion?: string;
  kind?: string;
  metadata?: {
    name?: string;
    namespace?: string;
    creationTimestamp?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  automountServiceAccountToken?: boolean;
  secrets?: Array<{ name: string }>;
  imagePullSecrets?: Array<{ name: string }>;
}

interface V1RoleBinding {
  metadata?: {
    name?: string;
    namespace?: string;
  };
  roleRef: {
    kind: 'Role' | 'ClusterRole';
    name: string;
  };
  subjects?: Array<{
    kind: string;
    name: string;
    namespace?: string;
  }>;
}

interface V1ClusterRoleBinding {
  metadata?: {
    name?: string;
  };
  roleRef: {
    kind: 'ClusterRole';
    name: string;
  };
  subjects?: Array<{
    kind: string;
    name: string;
    namespace?: string;
  }>;
}

export const ServiceAccountAdapter: ResourceAdapter<V1ServiceAccount> = {
  kinds: ['ServiceAccount', 'ServiceAccounts'],

  adapt(context: string, resource: V1ServiceAccount): ResourceSections {
    const sections: Section[] = [];
    const namespace = resource.metadata?.namespace ?? '';
    const name = resource.metadata?.name ?? '';

    // Status cards for key info
    const automount = resource.automountServiceAccountToken;
    const secretsCount = resource.secrets?.length ?? 0;
    const pullSecretsCount = resource.imagePullSecrets?.length ?? 0;

    sections.push({
      id: 'status',
      data: {
        type: 'status-cards',
        items: [
          {
            label: 'Automount Token',
            value: automount === false ? 'Disabled' : 'Enabled',
            status: automount === false ? 'warning' : 'success',
          },
          {
            label: 'Secrets',
            value: `${secretsCount} mounted, ${pullSecretsCount} pull`,
          },
        ],
      },
    });

    // Secrets section
    if (resource.secrets && resource.secrets.length > 0) {
      sections.push({
        id: 'secrets',
        title: 'Mounted Secrets',
        data: {
          type: 'info-grid',
          columns: 1,
          items: resource.secrets.map((s, i) => ({
            label: `Secret ${i + 1}`,
            value: s.name,
          })),
        },
      });
    }

    // Image Pull Secrets section
    if (resource.imagePullSecrets && resource.imagePullSecrets.length > 0) {
      sections.push({
        id: 'imagePullSecrets',
        title: 'Image Pull Secrets',
        data: {
          type: 'info-grid',
          columns: 1,
          items: resource.imagePullSecrets.map((s, i) => ({
            label: `Pull Secret ${i + 1}`,
            value: s.name,
          })),
        },
      });
    }

    // RoleBindings section - async loader
    const roleBindingsLoader = async (): Promise<RoleBindingData[]> => {
      const bindings: RoleBindingData[] = [];

      // Fetch RoleBindings in the same namespace
      try {
        const rbConfig = await getResourceConfig(context, 'rolebindings');
        if (rbConfig) {
          const rbList = await getResourceList(context, rbConfig, namespace);
          for (const item of rbList) {
            const rb = item as unknown as V1RoleBinding;
            const subjects = rb.subjects ?? [];
            const matches = subjects.some(
              (s) =>
                s.kind === 'ServiceAccount' &&
                s.name === name &&
                (s.namespace === namespace || !s.namespace),
            );
            if (matches) {
              bindings.push({
                name: rb.metadata?.name ?? 'Unknown',
                namespace: rb.metadata?.namespace,
                context,
                isClusterBinding: false,
                roleRef: {
                  kind: rb.roleRef.kind,
                  name: rb.roleRef.name,
                },
                summary: `Grants ${rb.roleRef.kind} "${rb.roleRef.name}"`,
              });
            }
          }
        }
      } catch {
        // Ignore errors fetching RoleBindings
      }

      // Fetch ClusterRoleBindings
      try {
        const crbConfig = await getResourceConfig(context, 'clusterrolebindings');
        if (crbConfig) {
          const crbList = await getResourceList(context, crbConfig);
          for (const item of crbList) {
            const crb = item as unknown as V1ClusterRoleBinding;
            const subjects = crb.subjects ?? [];
            const matches = subjects.some(
              (s) => s.kind === 'ServiceAccount' && s.name === name && s.namespace === namespace,
            );
            if (matches) {
              bindings.push({
                name: crb.metadata?.name ?? 'Unknown',
                namespace: undefined,
                context,
                isClusterBinding: true,
                roleRef: {
                  kind: 'ClusterRole',
                  name: crb.roleRef.name,
                },
                summary: `Grants ClusterRole "${crb.roleRef.name}" cluster-wide`,
              });
            }
          }
        }
      } catch {
        // Ignore errors fetching ClusterRoleBindings
      }

      return bindings;
    };

    sections.push({
      id: 'rolebindings',
      title: 'Role Bindings',
      data: {
        type: 'related-rolebindings',
        loader: roleBindingsLoader,
      },
    });

    return { sections };
  },
};
