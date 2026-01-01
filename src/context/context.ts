import { createContext } from 'react';
import type { V1APIResource, KubernetesResource, CoreV1Event } from '../api/kubernetes/kubernetes';
import type { TableResponse } from '../types/table';
import type { V1Namespace } from '@kubernetes/client-node';

export type AppMode = 'kubernetes' | 'docker' | null;

export interface ContextValue {
  // Mode
  mode: AppMode;
  setMode: (mode: AppMode) => void;

  // Kubernetes state
  kubernetesContext: string;
  kubernetesContexts: string[];
  kubernetesNamespace: string | undefined;
  kubernetesNamespaces: V1Namespace[];
  kubernetesResource: V1APIResource | null;

  // Kubernetes setters
  setKubernetesContext: (context: string) => void;
  setKubernetesNamespace: (namespace: string | undefined) => void;
  setKubernetesResource: (resource: V1APIResource | null) => void;

  // Docker state
  dockerContext: string;
  dockerContexts: string[];

  // Docker setters
  setDockerContext: (context: string) => void;

  // Kubernetes API wrappers (context is auto-injected)
  kubernetesApi: {
    getResource: (config: V1APIResource, name: string, namespace?: string) => Promise<KubernetesResource>;
    getResourceList: (config: V1APIResource, namespace?: string) => Promise<KubernetesResource[]>;
    getResourceTable: (config: V1APIResource, namespace?: string) => Promise<TableResponse>;
    getResourceEvents: (name: string, namespace?: string) => Promise<CoreV1Event[]>;
    updateResource: (config: V1APIResource, name: string, resource: KubernetesResource, namespace?: string) => Promise<KubernetesResource>;
  };
}

export const Context = createContext<ContextValue | null>(null);
