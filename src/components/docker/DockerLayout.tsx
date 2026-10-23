import { useState, useCallback, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from '@tanstack/react-router';
import { Search, Sparkles } from 'lucide-react';
import { Nav as DockerNav, type DockerResourceType } from './Nav';
import { ContextSelector } from '../ContextSelector';
import { Sidebar } from '../Sidebar';
import { CommandPalette } from '../CommandPalette';
import { ChatPanel } from '../ChatPanel';
import { createDockerAdapter } from './Commands';
import {
  dockerAdapterConfig,
  createDockerTools,
  buildDockerInstructions,
  type DockerEnvironment,
} from './ChatAdapter';
import { usePanels } from '../../hooks/usePanelState';
import { ResourcePage } from './ResourcePage';
import { SystemFooter, SystemStopped } from './ContextSystem';
import { isContextSystemStopped, useContextSystem } from '../../hooks/useContextSystem';
import { useAppConfig } from '../../hooks/useAppConfig';

const validResourceTypes: DockerResourceType[] = [
  'applications',
  'containers',
  'images',
  'volumes',
  'networks',
];

function isValidResourceType(type: string): type is DockerResourceType {
  return validResourceTypes.includes(type as DockerResourceType);
}

export function DockerLayout() {
  const { context, resourceType, name } = useParams({ strict: false });
  const navigate = useNavigate();
  const config = useAppConfig();

  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  const { isOpen: isPanelOpen, toggle: togglePanel, close: closePanel } = usePanels();
  const isChatPanelOpen = isPanelOpen('ai');
  const toggleChatPanel = useCallback(() => togglePanel('ai'), [togglePanel]);
  const closeChatPanel = useCallback(() => closePanel('ai'), [closePanel]);

  const kubernetesContexts = config.kubernetes?.contexts || [];
  const dockerContexts = config.docker?.contexts || [];

  const isWelcome = !resourceType;

  // Service behind the context that can be started / stopped (Apple
  // container, Docker Desktop)
  const systemKind = context ? config.docker?.systems?.[context] : undefined;
  const system = useContextSystem(context || '', !!systemKind);
  const showSystemStopped = !!systemKind && isContextSystemStopped(system);
  // Hold the main area until the first status arrives, so a stopped service
  // never flashes resource list errors
  const awaitingSystemStatus = !!systemKind && !system.status && !system.error;

  const currentResourceType: DockerResourceType | null =
    resourceType && isValidResourceType(resourceType) ? resourceType : null;

  // An unknown resource type in the URL would render a blank page — bounce
  // back to the docker welcome screen instead.
  useEffect(() => {
    if (context && resourceType && !isValidResourceType(resourceType)) {
      navigate({ to: '/docker/$context', params: { context }, replace: true });
    }
  }, [context, resourceType, navigate]);

  const setContext = useCallback(
    (newContext: string) => {
      if (currentResourceType) {
        navigate({
          to: '/docker/$context/$resourceType',
          params: { context: newContext, resourceType: currentResourceType },
        });
      } else {
        navigate({
          to: '/docker/$context',
          params: { context: newContext },
        });
      }
    },
    [currentResourceType, navigate],
  );

  const setResource = useCallback(
    (resource: DockerResourceType) => {
      navigate({
        to: '/docker/$context/$resourceType',
        params: { context: context!, resourceType: resource },
      });
    },
    [context, navigate],
  );

  const setSelectedItem = useCallback(
    (itemName: string | undefined) => {
      if (!currentResourceType) return;
      if (itemName) {
        navigate({
          to: '/docker/$context/$resourceType/$name',
          params: { context: context!, resourceType: currentResourceType, name: itemName },
        });
      } else {
        navigate({
          to: '/docker/$context/$resourceType',
          params: { context: context!, resourceType: currentResourceType },
        });
      }
    },
    [context, currentResourceType, navigate],
  );

  const setClusterContext = useCallback(
    (clusterContext: string) => {
      navigate({
        to: '/cluster/$context',
        params: { context: clusterContext },
      });
    },
    [navigate],
  );

  const closeCommandPalette = useCallback(() => {
    setIsCommandPaletteOpen(false);
  }, []);

  const navigateToItem = useCallback(
    (resourceType: DockerResourceType, itemId: string) => {
      navigate({
        to: '/docker/$context/$resourceType/$name',
        params: { context: context!, resourceType, name: itemId },
      });
    },
    [context, navigate],
  );

  const commandPaletteAdapter = useMemo(() => {
    return createDockerAdapter({
      context: context || '',
      onSelectResource: setResource,
      onSelectItem: navigateToItem,
      onClose: closeCommandPalette,
    });
  }, [context, setResource, navigateToItem, closeCommandPalette]);

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

  const chatEnvironment = useMemo(
    (): DockerEnvironment => ({
      context: context || '',
      selectedResourceType: currentResourceType || undefined,
    }),
    [context, currentResourceType],
  );

  const chatTools = useMemo(() => createDockerTools(chatEnvironment), [chatEnvironment]);

  return (
    <div className="flex h-screen overflow-hidden bg-bg text-fg">
      <Sidebar>
        <div className="shrink-0 px-2 pb-1">
          <ContextSelector
            mode="docker"
            contexts={kubernetesContexts}
            selectedContext=""
            onSelectContext={setClusterContext}
            dockerContexts={dockerContexts}
            selectedDockerContext={context || ''}
            onSelectDockerContext={setContext}
          />
        </div>
        <DockerNav
          selectedResource={currentResourceType}
          onSelectResource={setResource}
          isWelcome={isWelcome}
        />
        {systemKind && <SystemFooter key={context} kind={systemKind} system={system} />}
      </Sidebar>

      {systemKind && showSystemStopped ? (
        <SystemStopped kind={systemKind} system={system} />
      ) : awaitingSystemStatus ? (
        <main className="window-drag flex-1" />
      ) : isWelcome ? (
        <main className="window-drag flex-1 flex flex-col h-full min-w-0 items-center justify-center relative">
          <div
            className={`app-toolbar absolute top-0 right-0 gap-1 ${
              !isChatPanelOpen ? 'window-controls-end' : ''
            }`}
          >
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
      ) : currentResourceType ? (
        <ResourcePage
          key={currentResourceType}
          context={context || ''}
          resourceType={currentResourceType}
          selectedItem={name}
          onSelectItem={setSelectedItem}
          isChatPanelOpen={isChatPanelOpen}
          onToggleChatPanel={toggleChatPanel}
        />
      ) : null}

      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={closeCommandPalette}
        adapter={commandPaletteAdapter}
      />

      {config.ai && (
        <ChatPanel
          key={`${dockerAdapterConfig.id}/${context}`}
          isOpen={isChatPanelOpen}
          onClose={closeChatPanel}
          otherPanelOpen={!!name}
          adapterConfig={dockerAdapterConfig}
          contextId={context}
          environment={chatEnvironment}
          tools={chatTools}
          buildInstructions={buildDockerInstructions}
        />
      )}
    </div>
  );
}
