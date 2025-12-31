import { createContext } from 'react';
import type { V1APIResource, CoreV1Event, KubernetesResource } from '../api/kubernetes/kubernetes';
import type { TableResponse } from '../types/table';
import type { V1Namespace } from '@kubernetes/client-node';
import type { Context } from '../config';

export interface ClusterContextValue {
  // State
  context: string;
  contexts: Context[];
  namespace: string | undefined;
  namespaces: V1Namespace[];
  selectedResource: V1APIResource | null;

  // Setters
  setContext: (context: string) => void;
  setNamespace: (namespace: string | undefined) => void;
  setSelectedResource: (resource: V1APIResource | null) => void;

  // API wrappers (context is auto-injected)
  api: {
    getResource: (config: V1APIResource, name: string, namespace?: string) => Promise<KubernetesResource>;
    getResourceList: (config: V1APIResource, namespace?: string) => Promise<KubernetesResource[]>;
    getResourceTable: (config: V1APIResource, namespace?: string) => Promise<TableResponse>;
    getResourceEvents: (name: string, namespace?: string) => Promise<CoreV1Event[]>;
    updateResource: (config: V1APIResource, name: string, resource: KubernetesResource, namespace?: string) => Promise<KubernetesResource>;
  };
}

export const ClusterContext = createContext<ClusterContextValue | null>(null);
