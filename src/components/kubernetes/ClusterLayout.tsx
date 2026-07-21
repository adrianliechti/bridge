import { useState, useCallback, useEffect, useMemo } from 'react';
import { useParams, useSearch, useNavigate } from '@tanstack/react-router';
import { Search, Sparkles } from 'lucide-react';
import { clusterRoute, type ClusterSearch } from '../../router';
import {
  getResourceConfig,
  getResourceConfigByQualifiedName,
  getResourceTypeSlug,
} from '../../api/kubernetes/kubernetesDiscovery';
import { usePanels } from '../../hooks/usePanelState';
import { ChatPanel } from '../ChatPanel';
import {
  kubernetesAdapterConfig,
  createKubernetesTools,
  buildKubernetesInstructions,
  type KubernetesEnvironment,
} from './ChatAdapter';
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

export function ClusterLayout() {
  const { context, resourceType, name } = useParams({ strict: false });
  const search = useSearch({ from: clusterRoute.id }) as ClusterSearch;
  const navigate = useNavigate();
  const config = getConfig();

  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [resourceConfig, setResourceConfig] = useState<V1APIResource | null>(null);
  const [resourceNotFound, setResourceNotFound] = useState(false);

  const { isOpen: isPanelOpen, toggle: togglePanel, close: closePanel } = usePanels();
  const isChatPanelOpen = isPanelOpen('ai');
  const toggleChatPanel = useCallback(() => togglePanel('ai'), [togglePanel]);
  const closeChatPanel = useCallback(() => closePanel('ai'), [closePanel]);

  const kubernetesContexts = useMemo(
    () => config.kubernetes?.contexts || [],
    [config.kubernetes?.contexts],
  );
  const dockerContexts = useMemo(() => config.docker?.contexts || [], [config.docker?.contexts]);

  const { data: namespacesData } = useKubernetesQuery(
    ['kubernetes', 'namespaces', context],
    () => (context ? getNamespaces(context) : Promise.resolve({ items: [] })),
    { enabled: !!context },
  );
  const namespaces = useMemo(() => namespacesData?.items || [], [namespacesData]);

  useEffect(() => {
    if (context) {
      preloadDiscovery(context);
    }
  }, [context]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!context || !resourceType) {
        if (!cancelled) {
          setResourceConfig(null);
          setResourceNotFound(false);
        }
        return;
      }
      try {
        const config = await getResourceConfig(context, resourceType);
        if (cancelled) return;
        if (config) {
          setResourceConfig(config);
          setResourceNotFound(false);
          return;
        }
        if (resourceType.includes('.')) {
          const crdConfig = await getResourceConfigByQualifiedName(context, resourceType);
          if (cancelled) return;
          if (crdConfig) {
            setResourceConfig(crdConfig);
            setResourceNotFound(false);
            return;
          }
        }
        // Discovery finished but the URL's resource type is unknown in this
        // cluster — clear any config left over from the previous route so we
        // don't keep rendering the old resource under the new URL.
        setResourceConfig(null);
        setResourceNotFound(true);
      } catch {
        if (cancelled) return;
        setResourceConfig(null);
        setResourceNotFound(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [context, resourceType]);

  const currentResourceConfig = resourceType && resourceType !== 'overview' ? resourceConfig : null;

  const chatEnvironment = useMemo(
    (): KubernetesEnvironment => ({
      currentContext: context || '',
      currentNamespace: search.namespace || 'all namespaces',
      selectedResourceKind: currentResourceConfig
        ? currentResourceConfig.group
          ? `${currentResourceConfig.kind} (${currentResourceConfig.group}/${currentResourceConfig.version})`
          : `${currentResourceConfig.kind} (${currentResourceConfig.version})`
        : undefined,
      selectedResourceName: name,
    }),
    [context, search.namespace, currentResourceConfig, name],
  );

  const chatTools = useMemo(() => createKubernetesTools(chatEnvironment), [chatEnvironment]);

  const setContext = useCallback(
    (newContext: string) => {
      if (context) {
        clearDiscoveryCache(context);
        resetMetricsCache(context);
      }

      const navigateTo = (type: string | undefined) => {
        if (type) {
          navigate({
            to: '/cluster/$context/$resourceType',
            params: { context: newContext, resourceType: type },
            search: { namespace: search.namespace },
          });
        } else {
          navigate({
            to: '/cluster/$context',
            params: { context: newContext },
            search: { namespace: search.namespace },
          });
        }
      };

      if (!resourceType || resourceType === 'overview') {
        navigateTo(resourceType);
        return;
      }

      getResourceConfig(newContext, resourceType)
        .then((config) => navigateTo(config ? resourceType : undefined))
        .catch(() => navigateTo(undefined));
    },
    [context, resourceType, search.namespace, navigate],
  );

  const patchSearch = useCallback(
    (patch: Partial<ClusterSearch>, replace?: boolean) => {
      const search = (prev: ClusterSearch) => ({ ...prev, ...patch });
      if (resourceType && name) {
        navigate({
          to: '/cluster/$context/$resourceType/$name',
          params: { context: context!, resourceType, name },
          search,
          replace,
        });
      } else if (resourceType) {
        navigate({
          to: '/cluster/$context/$resourceType',
          params: { context: context!, resourceType },
          search,
          replace,
        });
      } else {
        navigate({
          to: '/cluster/$context',
          params: { context: context! },
          search,
          replace,
        });
      }
    },
    [context, resourceType, name, navigate],
  );

  const setNamespace = useCallback(
    (namespace: string | undefined) => {
      // A namespace switch changes the visible list; a selected item from the
      // previous namespace no longer belongs, so drop it (and its tab) from the URL.
      if (resourceType && name) {
        navigate({
          to: '/cluster/$context/$resourceType',
          params: { context: context!, resourceType },
          search: (prev) => ({ ...prev, namespace, tab: undefined }),
        });
        return;
      }
      patchSearch({ namespace });
    },
    [context, resourceType, name, navigate, patchSearch],
  );

  const setResource = useCallback(
    (resource: V1APIResource | null) => {
      const type = !resource ? 'overview' : getResourceTypeSlug(resource);
      navigate({
        to: '/cluster/$context/$resourceType',
        params: { context: context!, resourceType: type },
        search: (prev) => ({ namespace: prev.namespace }),
      });
    },
    [context, navigate],
  );

  const setSelectedItem = useCallback(
    (itemName: string | undefined) => {
      if (!resourceType) return;
      if (itemName) {
        navigate({
          to: '/cluster/$context/$resourceType/$name',
          params: { context: context!, resourceType, name: itemName },
          search: (prev) => prev,
        });
      } else {
        navigate({
          to: '/cluster/$context/$resourceType',
          params: { context: context!, resourceType },
          search: (prev) => ({ ...prev, tab: undefined }),
        });
      }
    },
    [context, resourceType, navigate],
  );

  const setTab = useCallback(
    (tab: 'overview' | 'metadata' | 'yaml' | 'events' | 'logs' | 'terminal' | undefined) => {
      patchSearch({ tab }, true);
    },
    [patchSearch],
  );

  const setDockerContext = useCallback(
    (dockerContext: string) => {
      navigate({
        to: '/docker/$context',
        params: { context: dockerContext },
      });
    },
    [navigate],
  );

  const closeCommandPalette = useCallback(() => {
    setIsCommandPaletteOpen(false);
  }, []);

  const navigateToResourceItem = useCallback(
    (type: string, itemName: string, itemNamespace?: string) => {
      navigate({
        to: '/cluster/$context/$resourceType/$name',
        params: { context: context!, resourceType: type, name: itemName },
        search: (prev) => ({ ...prev, namespace: itemNamespace ?? prev.namespace }),
      });
    },
    [context, navigate],
  );

  const commandPaletteAdapter = useMemo(() => {
    return createKubernetesAdapter({
      context: context || '',
      namespace: search.namespace,
      namespaces,
      contexts: kubernetesContexts.map((name) => ({ name })),
      currentContext: context || '',
      setNamespace,
      setContext,
      setSelectedResource: setResource,
      setSelectedItem: navigateToResourceItem,
      onClose: closeCommandPalette,
    });
  }, [
    context,
    search.namespace,
    namespaces,
    kubernetesContexts,
    setNamespace,
    setContext,
    setResource,
    navigateToResourceItem,
    closeCommandPalette,
  ]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
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

      {isWelcome ? (
        <main className="flex-1 flex flex-col h-full min-w-0 items-center justify-center">
          <div className="text-center">
            <img src="/logo.png" alt="Logo" className="w-48 h-48 mx-auto dark:hidden" />
            <img src="/logo_dark.png" alt="Logo" className="w-48 h-48 mx-auto hidden dark:block" />
            <p className="mt-4 text-sm text-neutral-500 dark:text-neutral-400">
              Select a resource from the sidebar or press{' '}
              <kbd className="px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-xs">
                ⌘K
              </kbd>{' '}
              to search
            </p>
          </div>
        </main>
      ) : isOverview ? (
        <main className="flex-1 flex flex-col h-full min-w-0">
          <header className="shrink-0 h-14 flex items-center justify-between px-5 mt-2">
            <div className="flex items-center gap-4">
              <h2 className="text-lg font-medium text-neutral-900 dark:text-neutral-100">
                Overview
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsCommandPaletteOpen(true)}
                className="p-2 rounded-md text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 dark:text-neutral-500 dark:hover:text-neutral-300 dark:hover:bg-neutral-800 transition-colors"
                title="Command Palette (⌘K)"
              >
                <Search size={18} />
              </button>
              {config.ai && (
                <button
                  onClick={toggleChatPanel}
                  className={`p-2 rounded-md transition-colors ${
                    isChatPanelOpen
                      ? 'text-sky-400 hover:text-sky-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                      : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 dark:text-neutral-500 dark:hover:text-neutral-300 dark:hover:bg-neutral-800'
                  }`}
                  title="AI Assistant"
                >
                  <Sparkles size={18} />
                </button>
              )}
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
          tab={search.tab}
          onTabChange={setTab}
          isChatPanelOpen={isChatPanelOpen}
          onToggleChatPanel={toggleChatPanel}
        />
      ) : resourceNotFound ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-neutral-500">
          <span>Unknown resource type “{resourceType}” in this cluster.</span>
          <button
            onClick={() => setResource(null)}
            className="px-3 py-1.5 text-sm rounded-md bg-neutral-200 hover:bg-neutral-300 text-neutral-700 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-300 transition-colors"
          >
            Go to Overview
          </button>
        </div>
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

      {config.ai && (
        <ChatPanel
          key={`${kubernetesAdapterConfig.id}/${context}`}
          isOpen={isChatPanelOpen}
          onClose={closeChatPanel}
          otherPanelOpen={!!name}
          adapterConfig={kubernetesAdapterConfig}
          contextId={context}
          environment={chatEnvironment}
          tools={chatTools}
          buildInstructions={buildKubernetesInstructions}
        />
      )}
    </div>
  );
}
