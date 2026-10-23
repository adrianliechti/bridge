import { useState, useCallback, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useSearch, useNavigate } from '@tanstack/react-router';
import { Search, Sparkles } from 'lucide-react';
import { clusterRoute, type ClusterSearch } from '../../router';
import { getResourceConfig, getResourceTypeSlug } from '../../api/kubernetes/kubernetesDiscovery';
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
import { Sidebar } from '../Sidebar';
import { CommandPalette } from '../CommandPalette';
import { createKubernetesAdapter } from './Commands';
import { ResourceOverview } from './ResourceOverview';
import { ResourcePage } from './ResourcePage';
import { useAppConfig } from '../../hooks/useAppConfig';
import { useKubernetesQuery } from '../../hooks/useKubernetesQuery';
import { getNamespaces } from '../../api/kubernetes/kubernetes';
import type { V1APIResource } from '../../api/kubernetes/kubernetesTable';

export function ClusterLayout() {
  const { context, resourceType, name } = useParams({ strict: false });
  const search = useSearch({ from: clusterRoute.id }) as ClusterSearch;
  const navigate = useNavigate();
  const config = useAppConfig();

  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

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

  const {
    data: resourceConfig,
    error: discoveryError,
    isSuccess: discoveryComplete,
    isFetching: discovering,
    refetch: retryDiscovery,
  } = useQuery({
    queryKey: ['kubernetes', 'discovery', context, resourceType],
    queryFn: async () => {
      const config = await getResourceConfig(context!, resourceType!);
      return config ?? null;
    },
    enabled: !!context && !!resourceType && resourceType !== 'overview',
    refetchInterval: false,
  });
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

      // Navigate immediately; the destination resolves its own discovery state.
      // Waiting here lets an older context selection win a later click.
      navigateTo(resourceType);
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
    <div className="flex h-screen overflow-hidden bg-bg text-fg">
      <Sidebar>
        <div className="shrink-0 px-2 pb-1">
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
          selectedResource={currentResourceConfig ?? null}
          onSelectResource={setResource}
          onSelectNamespace={setNamespace}
          isOverviewSelected={isOverview}
          isWelcome={isWelcome}
        />
      </Sidebar>

      {isWelcome ? (
        <main className="window-drag flex-1 flex flex-col h-full min-w-0 items-center justify-center">
          <div className="text-center">
            <img src="/logo.png" alt="Logo" className="w-48 h-48 mx-auto dark:hidden" />
            <img src="/logo_dark.png" alt="Logo" className="w-48 h-48 mx-auto hidden dark:block" />
            <p className="mt-4 text-sm text-fg-dim">
              Select a resource from the sidebar or press{' '}
              <kbd className="px-1.5 py-0.5 rounded bg-bg-elevated text-fg-muted text-xs">⌘K</kbd>{' '}
              to search
            </p>
          </div>
        </main>
      ) : isOverview ? (
        <main className="flex-1 flex flex-col h-full min-w-0">
          <header className={`app-toolbar ${!isChatPanelOpen ? 'window-controls-end' : ''}`}>
            <h2 className="app-toolbar-title">Overview</h2>
            <div className="window-no-drag flex items-center gap-1">
              <button
                onClick={() => setIsCommandPaletteOpen(true)}
                className="toolbar-button"
                title="Command Palette (⌘K)"
              >
                <Search size={16} />
              </button>
              {config.ai && (
                <button
                  onClick={toggleChatPanel}
                  className="toolbar-button"
                  aria-pressed={isChatPanelOpen}
                  title="AI Assistant"
                >
                  <Sparkles size={16} />
                </button>
              )}
            </div>
          </header>
          <section className="flex-1 overflow-hidden min-h-0">
            <ResourceOverview
              key={`${context}/${search.namespace ?? '*'}`}
              context={context || ''}
              namespace={search.namespace}
              isChatPanelOpen={isChatPanelOpen}
            />
          </section>
        </main>
      ) : currentResourceConfig ? (
        <ResourcePage
          key={`${context}/${currentResourceConfig.group || ''}/${currentResourceConfig.name}`}
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
      ) : discoveryError || discoveryComplete ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-neutral-500">
          <span role="alert">
            {discoveryError?.message ?? `Unknown resource type “${resourceType}” in this cluster.`}
          </span>
          <button
            type="button"
            disabled={discovering}
            onClick={() => {
              clearDiscoveryCache(context);
              void retryDiscovery();
            }}
            className="text-sm underline disabled:opacity-50"
          >
            {discovering ? 'Retrying...' : 'Retry'}
          </button>
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
