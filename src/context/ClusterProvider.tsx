import { useState, useCallback, useMemo, type ReactNode } from 'react';
import { ClusterContext } from './clusterContext';
import { useKubernetesQuery } from '../hooks/useKubernetesQuery';
import type { V1Namespace } from '@kubernetes/client-node';
import {
  getNamespaces,
  getResource,
  getResourceList,
  getResourceEvents,
  updateResource,
  type V1APIResource,
  type KubernetesResource,
} from '../api/kubernetes';
import { getResourceTable } from '../api/kubernetesTable';
import { preloadDiscovery, clearDiscoveryCache } from '../api/kubernetesDiscovery';
import { resetMetricsCache } from '../api/kubernetesMetrics';
import { getConfig } from '../config';

interface ClusterProviderProps {
  children: ReactNode;
}

export function ClusterProvider({ children }: ClusterProviderProps) {
  const config = getConfig();
  const [selectedContext, setSelectedContext] = useState<string>(
    () => config.defaultContext || config.contexts[0]?.name || ''
  );
  const [selectedNamespace, setSelectedNamespace] = useState<string | undefined>(
    () => config.defaultNamespace
  );

  // Fetch namespaces for the current context
  const { data: namespacesData } = useKubernetesQuery(
    () => selectedContext ? getNamespaces(selectedContext) : Promise.resolve({ items: [] } as Awaited<ReturnType<typeof getNamespaces>>),
    [selectedContext]
  );

  // Use V1Namespace directly from API response
  const namespaces: V1Namespace[] = useMemo(() => {
    return namespacesData?.items || [];
  }, [namespacesData]);

  // Preload discovery data when context changes
  useMemo(() => {
    if (selectedContext) {
      preloadDiscovery(selectedContext);
    }
  }, [selectedContext]);

  // Handler for context change - reset namespace and caches
  const handleContextChange = useCallback((context: string) => {
    // Clear caches for the old context
    clearDiscoveryCache(selectedContext);
    resetMetricsCache(selectedContext);

    setSelectedContext(context);
    setSelectedNamespace(undefined); // Reset namespace when context changes
  }, [selectedContext]);

  // API wrappers with context auto-injected
  const api = useMemo(() => ({
    getResource: (resourceConfig: V1APIResource, name: string, namespace?: string) =>
      getResource(selectedContext, resourceConfig, name, namespace),

    getResourceList: (resourceConfig: V1APIResource, namespace?: string) =>
      getResourceList(selectedContext, resourceConfig, namespace),

    getResourceTable: (resourceConfig: V1APIResource, namespace?: string) =>
      getResourceTable(selectedContext, resourceConfig, namespace),

    getResourceEvents: (name: string, namespace?: string) =>
      getResourceEvents(selectedContext, name, namespace),

    updateResource: (resourceConfig: V1APIResource, name: string, resource: KubernetesResource, namespace?: string) =>
      updateResource(selectedContext, resourceConfig, name, resource, namespace),
  }), [selectedContext]);

  const value = useMemo(() => ({
    context: selectedContext,
    contexts: config.contexts,
    namespace: selectedNamespace,
    namespaces,
    setContext: handleContextChange,
    setNamespace: setSelectedNamespace,
    api,
  }), [selectedContext, config.contexts, selectedNamespace, namespaces, handleContextChange, api]);

  return (
    <ClusterContext.Provider value={value}>
      {children}
    </ClusterContext.Provider>
  );
}
