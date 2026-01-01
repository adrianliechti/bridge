import { useState, useCallback, useEffect, useMemo } from 'react';
import { useParams, useSearch, useNavigate } from '@tanstack/react-router';
import { Search } from 'lucide-react';
import { clusterRoute, type ClusterSearch } from '../../router';
import { getResourceConfig, getResourceConfigByQualifiedName } from '../../api/kubernetes/kubernetesDiscovery';
import { preloadDiscovery, clearDiscoveryCache } from '../../api/kubernetes/kubernetesDiscovery';
import { resetMetricsCache } from '../../api/kubernetes/kubernetesMetrics';
import { ClusterNav } from './Nav';
import { ContextSelector } from '../ContextSelector';
import { CommandPalette } from '../CommandPalette';
import { createKubernetesAdapter } from './Commands';
import { ResourceOverview } from './ResourceOverview';
import { ResourcePage } from './ResourcePage';
import { getConfig } from '../../config';
import { useKubernetesQuery } from '../../hooks/useKubernetesQuery';
import { getNamespaces } from '../../api/kubernetes/kubernetes';
import type { V1APIResource } from '../../api/kubernetes/kubernetesTable';

// Well-known API groups that should use short names in URLs (like kubectl)
// e.g., "deployments" instead of "deployments.apps"
const WELL_KNOWN_GROUPS = new Set([
  'apps',
  'batch',
  'networking.k8s.io',
  'storage.k8s.io',
  'rbac.authorization.k8s.io',
  'policy',
  'autoscaling',
  'coordination.k8s.io',
  'discovery.k8s.io',
  'events.k8s.io',
  'node.k8s.io',
  'scheduling.k8s.io',
]);

// Check if a resource should use short name (no group suffix) in URL
const shouldUseShortName = (resource: V1APIResource) => {
  const group = resource.group || '';
  return group === '' || WELL_KNOWN_GROUPS.has(group);
};

export function ClusterLayout() {
  const { context, resourceType, name } = useParams({ strict: false });
  const search = useSearch({ from: clusterRoute.id }) as ClusterSearch;
  const navigate = useNavigate();
  const config = getConfig();
  
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [resourceConfig, setResourceConfig] = useState<V1APIResource | null>(null);

  const kubernetesContexts = config.kubernetes?.contexts || [];
  const dockerContexts = config.docker?.contexts || [];

  // Fetch namespaces for namespace selector
  const { data: namespacesData } = useKubernetesQuery(
    ['kubernetes', 'namespaces', context],
    () => context ? getNamespaces(context) : Promise.resolve({ items: [] }),
    { enabled: !!context }
  );
  const namespaces = useMemo(() => namespacesData?.items || [], [namespacesData]);

  // Preload discovery when context changes
  useEffect(() => {
    if (context) {
      preloadDiscovery(context);
    }
  }, [context]);

  // Load resource config when resourceType changes
  useEffect(() => {
    if (context && resourceType) {
      // Try alias lookup first (handles short names like 'deployments')
      // Then fall back to qualified name lookup (for CRDs like 'applications.argoproj.io')
      getResourceConfig(context, resourceType)
        .then((config) => {
          if (config) {
            setResourceConfig(config);
          } else if (resourceType.includes('.')) {
            // Try qualified name lookup for CRDs
            return getResourceConfigByQualifiedName(context, resourceType);
          }
          return null;
        })
        .then((config) => {
          if (config) {
            setResourceConfig(config);
          }
        })
        .catch(() => {
          setResourceConfig(null);
        });
    }
  }, [context, resourceType]);

  // Reset resource config when leaving resource view
  const currentResourceConfig = resourceType ? resourceConfig : null;

  // Navigation helpers
  const setContext = useCallback((newContext: string) => {
    if (context) {
      clearDiscoveryCache(context);
      resetMetricsCache(context);
    }
    
    // Try to preserve resource type
    if (resourceType) {
      getResourceConfig(newContext, resourceType)
        .then((config) => {
          if (config) {
            navigate({
              to: '/cluster/$context/$resourceType',
              params: { context: newContext, resourceType },
              search: { namespace: search.namespace },
            });
          } else {
            navigate({
              to: '/cluster/$context',
              params: { context: newContext },
            });
          }
        })
        .catch(() => {
          navigate({
            to: '/cluster/$context',
            params: { context: newContext },
          });
        });
    } else {
      navigate({
        to: '/cluster/$context',
        params: { context: newContext },
        search: (prev) => ({ ...prev, namespace: search.namespace }),
      });
    }
  }, [context, resourceType, search.namespace, navigate]);

  const setNamespace = useCallback((namespace: string | undefined) => {
    navigate({
      to: '.',
      search: (prev) => ({ ...prev, namespace }),
    });
  }, [navigate]);

  const setResource = useCallback((resource: V1APIResource | null) => {
    if (resource) {
      // Use short name for well-known groups, qualified name for CRDs
      const type = shouldUseShortName(resource) 
        ? resource.name 
        : `${resource.name}.${resource.group}`;
      navigate({
        to: '/cluster/$context/$resourceType',
        params: { context: context!, resourceType: type },
        search: (prev) => prev,
      });
    } else {
      // Navigate to overview
      navigate({
        to: '/cluster/$context/$resourceType',
        params: { context: context!, resourceType: 'overview' },
        search: (prev) => prev,
      });
    }
  }, [context, navigate]);

  const setSelectedItem = useCallback((itemName: string | undefined) => {
    if (itemName && resourceType) {
      navigate({
        to: '/cluster/$context/$resourceType/$name',
        params: { context: context!, resourceType, name: itemName },
        search: (prev) => prev,
      });
    } else if (resourceType) {
      navigate({
        to: '/cluster/$context/$resourceType',
        params: { context: context!, resourceType },
        search: (prev) => prev,
      });
    }
  }, [context, resourceType, navigate]);

  const setDockerContext = useCallback((dockerContext: string) => {
    navigate({
      to: '/docker/$context/$resourceType',
      params: { context: dockerContext, resourceType: 'containers' },
    });
  }, [navigate]);

  // Close command palette handler
  const closeCommandPalette = useCallback(() => {
    setIsCommandPaletteOpen(false);
  }, []);

  // Navigate to a specific resource item from command palette
  const navigateToResourceItem = useCallback((resourceType: string, itemName: string, itemNamespace?: string) => {
    // If the item is in a different namespace, update the namespace
    if (itemNamespace && itemNamespace !== search.namespace) {
      navigate({
        to: '/cluster/$context/$resourceType/$name',
        params: { context: context!, resourceType, name: itemName },
        search: { namespace: itemNamespace },
      });
    } else {
      navigate({
        to: '/cluster/$context/$resourceType/$name',
        params: { context: context!, resourceType, name: itemName },
        search: (prev) => prev,
      });
    }
  }, [context, search.namespace, navigate]);

  // Command palette adapter
  const commandPaletteAdapter = useMemo(() => {
    return createKubernetesAdapter({
      context: context || '',
      namespace: search.namespace,
      namespaces,
      setNamespace,
      setSelectedResource: setResource,
      setSelectedItem: navigateToResourceItem,
      onClose: closeCommandPalette,
    });
  }, [context, search.namespace, namespaces, setNamespace, setResource, navigateToResourceItem, closeCommandPalette]);

  // Global keyboard shortcut for command palette
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen(prev => !prev);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const isOverview = resourceType === 'overview';
  const isWelcome = !resourceType;

  return (
    <div className="flex h-screen overflow-hidden bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <div className="py-2 pl-2 shrink-0 h-full">
        <aside className="w-56 h-full shrink-0 bg-white dark:bg-black/40 backdrop-blur-xl flex flex-col rounded-xl border border-neutral-300/50 dark:border-neutral-700/50">
          <div className="shrink-0 px-3 pt-3 pb-2">
            <ContextSelector
              mode="cluster"
              contexts={kubernetesContexts}
              selectedContext={context || ''}
              onSelectContext={setContext}
              dockerContexts={dockerContexts}
              selectedDockerContext=""
              onSelectDockerContext={setDockerContext}
            />
          </div>
          <ClusterNav
            context={context || ''}
            namespace={search.namespace}
            namespaces={namespaces}
            selectedResource={resourceConfig}
            onSelectResource={setResource}
            onSelectNamespace={setNamespace}
            isOverviewSelected={isOverview}
            isWelcome={isWelcome}
          />
        </aside>
      </div>

      {/* Main content */}
      {isWelcome ? (
        <main className="flex-1 flex flex-col h-full min-w-0 items-center justify-center">
          <div className="text-center">
            <img src="/logo.png" alt="Logo" className="w-48 h-48 mx-auto dark:hidden" />
            <img src="/logo_dark.png" alt="Logo" className="w-48 h-48 mx-auto hidden dark:block" />
            <p className="mt-4 text-sm text-neutral-500 dark:text-neutral-400">
              Select a resource from the sidebar or press <kbd className="px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-xs">⌘K</kbd> to search
            </p>
          </div>
        </main>
      ) : isOverview ? (
        <main className="flex-1 flex flex-col h-full min-w-0">
          <header className="shrink-0 h-14 flex items-center justify-between px-5 mt-2">
            <div className="flex items-center gap-4">
              <h2 className="text-lg font-medium text-neutral-900 dark:text-neutral-100">Overview</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsCommandPaletteOpen(true)}
                className="p-2 rounded-md text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 dark:text-neutral-500 dark:hover:text-neutral-300 dark:hover:bg-neutral-800 transition-colors"
                title="Command Palette (⌘K)"
              >
                <Search size={18} />
              </button>
            </div>
          </header>
          <section className="flex-1 overflow-hidden min-h-0">
            <ResourceOverview context={context || ''} namespace={search.namespace} />
          </section>
        </main>
      ) : currentResourceConfig ? (
        <ResourcePage
          key={`${currentResourceConfig.group || ''}/${currentResourceConfig.name}`}
          context={context || ''}
          namespace={search.namespace}
          resource={currentResourceConfig}
          selectedItem={name}
          onSelectItem={setSelectedItem}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center text-neutral-500">
          Loading resource...
        </div>
      )}

      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={closeCommandPalette}
        adapter={commandPaletteAdapter}
      />
    </div>
  );
}
