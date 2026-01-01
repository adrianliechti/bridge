import { useState, useCallback, useMemo, useEffect, useRef, type ReactNode } from 'react';
import { Context, type AppMode } from './context';
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
} from '../api/kubernetes/kubernetes';
import { getResourceTable } from '../api/kubernetes/kubernetesTable';
import { preloadDiscovery, clearDiscoveryCache, getResourceConfig } from '../api/kubernetes/kubernetesDiscovery';
import { resetMetricsCache } from '../api/kubernetes/kubernetesMetrics';
import { getConfig } from '../config';

const MODE_STORAGE_KEY = 'bridge-app-mode';

// Helper to create a resource identifier
function getResourceId(resource: V1APIResource): string {
  return resource.group ? `${resource.name}.${resource.group}` : resource.name;
}

interface ContextProviderProps {
  children: ReactNode;
}

export function ContextProvider({ children }: ContextProviderProps) {
  const config = getConfig();

  // Availability
  const dockerAvailable = (config.docker?.contexts?.length ?? 0) > 0;
  const kubernetesAvailable = (config.kubernetes?.contexts?.length ?? 0) > 0;

  // Mode helpers
  const getDefaultMode = (): AppMode => {
    if (kubernetesAvailable) return 'kubernetes';
    if (dockerAvailable) return 'docker';
    return null;
  };

  const isModeAvailable = (m: AppMode): boolean => {
    if (m === 'kubernetes') return kubernetesAvailable;
    if (m === 'docker') return dockerAvailable;
    return false;
  };

  // Mode state
  const [mode, setModeState] = useState<AppMode>(() => {
    const stored = localStorage.getItem(MODE_STORAGE_KEY) as AppMode;
    if (stored && isModeAvailable(stored)) {
      return stored;
    }
    return getDefaultMode();
  });

  const setMode = useCallback((newMode: AppMode) => {
    if (newMode) {
      // Don't allow switching to a mode that's not available
      if (newMode === 'kubernetes' && !kubernetesAvailable) return;
      if (newMode === 'docker' && !dockerAvailable) return;
    }
    setModeState(newMode);
    if (newMode) {
      localStorage.setItem(MODE_STORAGE_KEY, newMode);
    }
  }, [kubernetesAvailable, dockerAvailable]);

  // Compute effective mode
  const effectiveMode: AppMode = (mode && !isModeAvailable(mode)) ? getDefaultMode() : mode;
  if (mode !== effectiveMode) {
    setModeState(effectiveMode);
  }

  // Kubernetes contexts - memoized to ensure stable reference
  const kubernetesContexts = useMemo(() => config.kubernetes?.contexts || [], [config.kubernetes?.contexts]);
  const [kubernetesContext, setKubernetesContextState] = useState<string>(
    () => config.kubernetes?.defaultContext || kubernetesContexts[0] || ''
  );
  const [kubernetesNamespace, setKubernetesNamespace] = useState<string | undefined>(
    () => config.kubernetes?.defaultNamespace
  );
  const [kubernetesResource, setKubernetesResource] = useState<V1APIResource | null>(null);

  // Docker contexts - memoized to ensure stable reference
  const dockerContexts = useMemo(() => config.docker?.contexts || [], [config.docker?.contexts]);
  const [dockerContext, setDockerContext] = useState<string>(
    () => config.docker?.defaultContext || dockerContexts[0] || ''
  );

  // Track pending state to restore after context switch
  const pendingNamespaceRef = useRef<string | undefined>(undefined);
  const pendingResourceIdRef = useRef<string | null>(null);

  // Fetch namespaces for the current Kubernetes context
  const { data: namespacesData } = useKubernetesQuery(
    () => kubernetesContext ? getNamespaces(kubernetesContext) : Promise.resolve({ items: [] } as Awaited<ReturnType<typeof getNamespaces>>),
    [kubernetesContext]
  );

  // Use V1Namespace directly from API response
  const kubernetesNamespaces: V1Namespace[] = useMemo(() => {
    return namespacesData?.items || [];
  }, [namespacesData]);

  // When namespaces load, check if we should restore a pending namespace
  useEffect(() => {
    if (pendingNamespaceRef.current && kubernetesNamespaces.length > 0) {
      const pendingNs = pendingNamespaceRef.current;
      const exists = kubernetesNamespaces.some(ns => ns.metadata?.name === pendingNs);
      if (exists) {
        setKubernetesNamespace(pendingNs);
      }
      pendingNamespaceRef.current = undefined;
    }
  }, [kubernetesNamespaces]);

  // Preload discovery data when Kubernetes context changes
  useMemo(() => {
    if (kubernetesContext) {
      preloadDiscovery(kubernetesContext);
    }
  }, [kubernetesContext]);

  // Handler for Kubernetes context change - preserve namespace and resource if they exist in new context
  const setKubernetesContext = useCallback((context: string) => {
    // Clear caches for the old context
    clearDiscoveryCache(kubernetesContext);
    resetMetricsCache(kubernetesContext);

    // Store current state to try to restore after context switch
    pendingNamespaceRef.current = kubernetesNamespace;
    pendingResourceIdRef.current = kubernetesResource ? getResourceId(kubernetesResource) : null;

    setKubernetesContextState(context);
    setKubernetesNamespace(undefined); // Reset initially, will restore if namespace exists
    setKubernetesResource(null); // Reset initially, will restore if resource exists
  }, [kubernetesContext, kubernetesNamespace, kubernetesResource]);

  // Try to restore pending resource after context switch
  useEffect(() => {
    if (pendingResourceIdRef.current && kubernetesContext) {
      const resourceId = pendingResourceIdRef.current;
      pendingResourceIdRef.current = null;
      
      getResourceConfig(kubernetesContext, resourceId.split('.')[0])
        .then((config) => {
          if (config && getResourceId(config) === resourceId) {
            setKubernetesResource(config);
          }
        })
        .catch(() => {
          // Resource not available, stay at null (overview)
        });
    }
  }, [kubernetesContext]);

  // Kubernetes API wrappers with context auto-injected
  const kubernetesApi = useMemo(() => ({
    getResource: (resourceConfig: V1APIResource, name: string, namespace?: string) =>
      getResource(kubernetesContext, resourceConfig, name, namespace),

    getResourceList: (resourceConfig: V1APIResource, namespace?: string) =>
      getResourceList(kubernetesContext, resourceConfig, namespace),

    getResourceTable: (resourceConfig: V1APIResource, namespace?: string) =>
      getResourceTable(kubernetesContext, resourceConfig, namespace),

    getResourceEvents: (name: string, namespace?: string) =>
      getResourceEvents(kubernetesContext, name, namespace),

    updateResource: (resourceConfig: V1APIResource, name: string, resource: KubernetesResource, namespace?: string) =>
      updateResource(kubernetesContext, resourceConfig, name, resource, namespace),
  }), [kubernetesContext]);

  const value = useMemo(() => ({
    mode: effectiveMode,
    setMode,
    kubernetesContext,
    kubernetesContexts,
    kubernetesNamespace,
    kubernetesNamespaces,
    kubernetesResource,
    setKubernetesContext,
    setKubernetesNamespace,
    setKubernetesResource,
    dockerContext,
    dockerContexts,
    setDockerContext,
    kubernetesApi,
  }), [effectiveMode, setMode, kubernetesContext, kubernetesContexts, kubernetesNamespace, kubernetesNamespaces, kubernetesResource, setKubernetesContext, dockerContext, dockerContexts, kubernetesApi]);

  return (
    <Context.Provider value={value}>
      {children}
    </Context.Provider>
  );
}
