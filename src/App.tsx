import { useCallback, useState, useEffect, useMemo } from 'react';
import { Search } from 'lucide-react';
import { Sidebar, type V1APIResource, type DockerResourceType } from './components/Sidebar';
import { ResourcePage as KubernetesResourcePage } from './components/kubernetes/ResourcePage';
import { ResourcePage as DockerResourcePage } from './components/docker/ResourcePage';
import { ResourceOverview } from './components/kubernetes/ResourceOverview';
import { WelcomePage } from './components/WelcomePage';
import { CommandPalette } from './components/CommandPalette';
import { createKubernetesAdapter } from './components/kubernetes/Commands';
import { createDockerAdapter } from './components/docker/Commands';
import { PanelProvider } from './context/PanelProvider';
import { ClusterProvider } from './context/ClusterProvider';
import { AppModeProvider } from './context/AppModeProvider';
import { useCluster } from './hooks/useCluster';
import { useAppMode } from './hooks/useAppMode';

function AppContent() {
  const { mode } = useAppMode();
  const { context, namespace, namespaces, setNamespace, selectedResource, setSelectedResource } = useCluster();
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  
  // Docker state
  const [selectedDockerResource, setSelectedDockerResource] = useState<DockerResourceType>('containers');

  // Close command palette handler
  const closeCommandPalette = useCallback(() => {
    setIsCommandPaletteOpen(false);
  }, []);

  // Create the appropriate adapter based on mode
  const commandPaletteAdapter = useMemo(() => {
    if (mode === 'docker') {
      return createDockerAdapter({
        onSelectResource: setSelectedDockerResource,
        onClose: closeCommandPalette,
      });
    }
    return createKubernetesAdapter({
      context,
      namespace,
      namespaces,
      setNamespace,
      setSelectedResource,
      onClose: closeCommandPalette,
    });
  }, [mode, context, namespace, namespaces, setNamespace, setSelectedResource, closeCommandPalette]);

  // Handler for sidebar resource selection (Kubernetes)
  const handleSelectResource = useCallback((resource: V1APIResource | null) => {
    setSelectedResource(resource);
  }, [setSelectedResource]);

  // Global keyboard shortcut for command palette (Cmd/Ctrl + K)
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

  // Check if overview is selected (Kubernetes)
  const isOverview = selectedResource === null;

  // Create a key for MainContent to force remount when resource changes
  const resourceKey = isOverview
    ? 'overview'
    : `${selectedResource.group || ''}/${selectedResource.name}`;

  // Render main content based on mode
  const renderMainContent = () => {
    if (mode === 'docker') {
      return <DockerResourcePage resourceType={selectedDockerResource} />;
    }

    // Kubernetes mode
    if (isOverview) {
      return (
        <main className="flex-1 flex flex-col h-full min-w-0">
          <header className="shrink-0 h-14 flex items-center justify-between px-5 mt-2">
            <div className="flex items-center gap-4">
              <h2 className="text-lg font-medium text-neutral-900 dark:text-neutral-100">Overview</h2>
              {namespace && (
                <span className="px-2.5 py-0.5 rounded-md text-xs bg-neutral-200/80 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                  {namespace}
                </span>
              )}
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
            {namespace ? (
              <ResourceOverview />
            ) : (
              <WelcomePage />
            )}
          </section>
        </main>
      );
    }

    return <KubernetesResourcePage key={resourceKey} resource={selectedResource} />;
  };

  return (
    <div className="flex h-screen overflow-hidden bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <div className="py-2 pl-2 shrink-0 h-full">
        <Sidebar
          selectedResource={selectedResource}
          onSelectResource={handleSelectResource}
          isOverviewSelected={isOverview}
          selectedDockerResource={selectedDockerResource}
          onSelectDockerResource={setSelectedDockerResource}
        />
      </div>
      {renderMainContent()}
      
      {/* Command Palette */}
      <CommandPalette 
        isOpen={isCommandPaletteOpen} 
        onClose={closeCommandPalette}
        adapter={commandPaletteAdapter}
      />
    </div>
  );
}

function App() {
  const { context } = useCluster();

  // Don't render until we have a context
  if (!context) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
        <p className="text-neutral-500">No Kubernetes contexts available</p>
      </div>
    );
  }

  // Use key to reset AppContent state when context changes
  return <AppContent key={context} />;
}

function AppWrapper() {
  return (
    <ClusterProvider>
      <PanelProvider>
        <AppModeProvider>
          <App />
        </AppModeProvider>
      </PanelProvider>
    </ClusterProvider>
  );
}

export default AppWrapper;
