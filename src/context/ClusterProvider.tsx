import { useState, useCallback, useMemo, useEffect, useRef, type ReactNode } from 'react';
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
import { preloadDiscovery, clearDiscoveryCache, getResourceConfig } from '../api/kubernetesDiscovery';
import { resetMetricsCache } from '../api/kubernetesMetrics';
import { getConfig } from '../config';

// Helper to create a resource identifier
function getResourceId(resource: V1APIResource): string {
  return resource.group ? `${resource.name}.${resource.group}` : resource.name;
}

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
  const [selectedResource, setSelectedResource] = useState<V1APIResource | null>(null);

  // Track pending state to restore after context switch
  const pendingNamespaceRef = useRef<string | undefined>(undefined);
  const pendingResourceIdRef = useRef<string | null>(null);

  // Fetch namespaces for the current context
  const { data: namespacesData } = useKubernetesQuery(
    () => selectedContext ? getNamespaces(selectedContext) : Promise.resolve({ items: [] } as Awaited<ReturnType<typeof getNamespaces>>),
    [selectedContext]
  );

  // Use V1Namespace directly from API response
  const namespaces: V1Namespace[] = useMemo(() => {
    return namespacesData?.items || [];
  }, [namespacesData]);

  // When namespaces load, check if we should restore a pending namespace
  useEffect(() => {
    if (pendingNamespaceRef.current && namespaces.length > 0) {
      const pendingNs = pendingNamespaceRef.current;
      const exists = namespaces.some(ns => ns.metadata?.name === pendingNs);
      if (exists) {
        setSelectedNamespace(pendingNs);
      }
      pendingNamespaceRef.current = undefined;
    }
  }, [namespaces]);

  // Preload discovery data when context changes
  useMemo(() => {
    if (selectedContext) {
      preloadDiscovery(selectedContext);
    }
  }, [selectedContext]);

  // Handler for context change - preserve namespace and resource if they exist in new context
  const handleContextChange = useCallback((context: string) => {
    // Clear caches for the old context
    clearDiscoveryCache(selectedContext);
    resetMetricsCache(selectedContext);

    // Store current state to try to restore after context switch
    pendingNamespaceRef.current = selectedNamespace;
    pendingResourceIdRef.current = selectedResource ? getResourceId(selectedResource) : null;

    setSelectedContext(context);
    setSelectedNamespace(undefined); // Reset initially, will restore if namespace exists
    setSelectedResource(null); // Reset initially, will restore if resource exists
  }, [selectedContext, selectedNamespace, selectedResource]);

  // Try to restore pending resource after context switch
  useEffect(() => {
    if (pendingResourceIdRef.current && selectedContext) {
      const resourceId = pendingResourceIdRef.current;
      pendingResourceIdRef.current = null;
      
      getResourceConfig(selectedContext, resourceId.split('.')[0])
        .then((config) => {
          if (config && getResourceId(config) === resourceId) {
            setSelectedResource(config);
          }
        })
        .catch(() => {
          // Resource not available, stay at null (overview)
        });
    }
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
    selectedResource,
    setContext: handleContextChange,
    setNamespace: setSelectedNamespace,
    setSelectedResource,
    api,
  }), [selectedContext, config.contexts, selectedNamespace, namespaces, selectedResource, handleContextChange, api]);

  return (
    <ClusterContext.Provider value={value}>
      {children}
    </ClusterContext.Provider>
  );
}
