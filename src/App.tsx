import { useCallback, useState, useEffect, useMemo } from 'react';
import { Search, ServerOff } from 'lucide-react';
import { Sidebar, type V1APIResource, type DockerResourceType } from './components/Sidebar';
import { ResourcePage as KubernetesResourcePage } from './components/kubernetes/ResourcePage';
import { ResourcePage as DockerResourcePage } from './components/docker/ResourcePage';
import { ResourceOverview } from './components/kubernetes/ResourceOverview';
import { WelcomePage } from './components/WelcomePage';
import { CommandPalette } from './components/CommandPalette';
import { createKubernetesAdapter } from './components/kubernetes/Commands';
import { createDockerAdapter } from './components/docker/Commands';
import { PanelProvider } from './context/PanelProvider';
import { ContextProvider } from './context/ContextProvider';
import { useMode, useKubernetes, useDocker } from './hooks/useContext';

function AppContent() {
  const { mode } = useMode();
  const kubernetes = useKubernetes();
  const docker = useDocker();
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
        context: docker.context,
        onSelectResource: setSelectedDockerResource,
        onClose: closeCommandPalette,
      });
    }
    return createKubernetesAdapter({
      context: kubernetes.context,
      namespace: kubernetes.namespace,
      namespaces: kubernetes.namespaces,
      setNamespace: kubernetes.setNamespace,
      setSelectedResource: kubernetes.setResource,
      onClose: closeCommandPalette,
    });
  }, [mode, kubernetes.context, docker.context, kubernetes.namespace, kubernetes.namespaces, kubernetes.setNamespace, kubernetes.setResource, closeCommandPalette]);

  // Handler for sidebar resource selection (Kubernetes)
  const handleSelectResource = useCallback((resource: V1APIResource | null) => {
    kubernetes.setResource(resource);
  }, [kubernetes.setResource]);

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
  const isOverview = kubernetes.resource === null;

  // Create a key for MainContent to force remount when resource changes
  const resourceKey = isOverview
    ? 'overview'
    : `${kubernetes.resource!.group || ''}/${kubernetes.resource!.name}`;

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
              {kubernetes.namespace && (
                <span className="px-2.5 py-0.5 rounded-md text-xs bg-neutral-200/80 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                  {kubernetes.namespace}
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
            {kubernetes.namespace ? (
              <ResourceOverview />
            ) : (
              <WelcomePage />
            )}
          </section>
        </main>
      );
    }

    return <KubernetesResourcePage key={resourceKey} resource={kubernetes.resource!} />;
  };

  return (
    <div className="flex h-screen overflow-hidden bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <div className="py-2 pl-2 shrink-0 h-full">
        <Sidebar
          selectedResource={kubernetes.resource}
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
  const kubernetes = useKubernetes();
  const docker = useDocker();
  const { mode } = useMode();

  // Don't render until we have a valid mode and context
  if (!mode) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
        <div className="flex flex-col items-center gap-4 max-w-md text-center px-6">
          <div className="p-4 rounded-full bg-neutral-100 dark:bg-neutral-900">
            <ServerOff size={32} className="text-neutral-400 dark:text-neutral-600" />
          </div>
          <div>
            <h2 className="text-lg font-medium text-neutral-700 dark:text-neutral-300 mb-2">
              No contexts available
            </h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-500">
              Bridge couldn't find any Kubernetes or Docker contexts. Make sure you have <code className="px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-800 text-xs">kubectl</code> or <code className="px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-800 text-xs">docker</code> configured on your system.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Use appropriate key based on mode to reset AppContent state when context changes
  const contextKey = mode === 'docker' ? docker.context : kubernetes.context;
  return <AppContent key={contextKey} />;
}

function AppWrapper() {
  return (
    <ContextProvider>
      <PanelProvider>
        <App />
      </PanelProvider>
    </ContextProvider>
  );
}

export default AppWrapper;
