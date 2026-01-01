import { useState, useCallback, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from '@tanstack/react-router';
import { Nav as DockerNav, type DockerResourceType } from './Nav';
import { ContextSelector } from '../ContextSelector';
import { CommandPalette } from '../CommandPalette';
import { createDockerAdapter } from './Commands';
import { ResourcePage } from './ResourcePage';
import { getConfig } from '../../config';

const validResourceTypes: DockerResourceType[] = ['containers', 'images', 'volumes', 'networks'];

function isValidResourceType(type: string): type is DockerResourceType {
  return validResourceTypes.includes(type as DockerResourceType);
}

export function DockerLayout() {
  const { context, resourceType, name } = useParams({ strict: false });
  const navigate = useNavigate();
  const config = getConfig();
  
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  const kubernetesContexts = config.kubernetes?.contexts || [];
  const dockerContexts = config.docker?.contexts || [];

  const isWelcome = !resourceType;

  // Validate and normalize resource type
  const currentResourceType: DockerResourceType | null = 
    resourceType && isValidResourceType(resourceType) ? resourceType : null;

  // Navigation helpers
  const setContext = useCallback((newContext: string) => {
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
  }, [currentResourceType, navigate]);

  const setResource = useCallback((resource: DockerResourceType) => {
    navigate({
      to: '/docker/$context/$resourceType',
      params: { context: context!, resourceType: resource },
    });
  }, [context, navigate]);

  const setSelectedItem = useCallback((itemName: string | undefined) => {
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
  }, [context, currentResourceType, navigate]);

  const setClusterContext = useCallback((clusterContext: string) => {
    navigate({
      to: '/cluster/$context',
      params: { context: clusterContext },
    });
  }, [navigate]);

  // Close command palette handler
  const closeCommandPalette = useCallback(() => {
    setIsCommandPaletteOpen(false);
  }, []);

  // Navigate to a specific resource item from command palette
  const navigateToItem = useCallback((resourceType: DockerResourceType, itemId: string) => {
    navigate({
      to: '/docker/$context/$resourceType/$name',
      params: { context: context!, resourceType, name: itemId },
    });
  }, [context, navigate]);

  // Command palette adapter
  const commandPaletteAdapter = useMemo(() => {
    return createDockerAdapter({
      context: context || '',
      onSelectResource: setResource,
      onSelectItem: navigateToItem,
      onClose: closeCommandPalette,
    });
  }, [context, setResource, navigateToItem, closeCommandPalette]);

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

  return (
    <div className="flex h-screen overflow-hidden bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <div className="py-2 pl-2 shrink-0 h-full">
        <aside className="w-56 h-full shrink-0 bg-white dark:bg-black/40 backdrop-blur-xl flex flex-col rounded-xl border border-neutral-300/50 dark:border-neutral-700/50">
          <div className="shrink-0 px-3 pt-3 pb-2">
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
      ) : currentResourceType ? (
        <ResourcePage
          key={currentResourceType}
          context={context || ''}
          resourceType={currentResourceType}
          selectedItem={name}
          onSelectItem={setSelectedItem}
        />
      ) : null}

      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={closeCommandPalette}
        adapter={commandPaletteAdapter}
      />
    </div>
  );
}
