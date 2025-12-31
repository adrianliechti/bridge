import { useCallback, useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import { ResourceSidebar, type V1APIResource } from './components/ResourceSidebar';
import { ResourcePage } from './components/ResourcePage';
import { ResourceOverview } from './components/ResourceOverview';
import { WelcomePage } from './components/WelcomePage';
import { CommandPalette } from './components/CommandPalette';
import { PanelProvider } from './context/PanelProvider';
import { ClusterProvider } from './context/ClusterProvider';
import { useCluster } from './hooks/useCluster';

function AppContent() {
  const { namespace, selectedResource, setSelectedResource } = useCluster();
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  // Handler for sidebar resource selection
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

  // Check if overview is selected
  const isOverview = selectedResource === null;

  // Create a key for MainContent to force remount when resource changes
  const resourceKey = isOverview
    ? 'overview'
    : `${selectedResource.group || ''}/${selectedResource.name}`;

  return (
    <div className="flex h-screen overflow-hidden bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <div className="py-2 pl-2 shrink-0 h-full">
        <ResourceSidebar
          selectedResource={selectedResource}
          onSelectResource={handleSelectResource}
          isOverviewSelected={isOverview}
        />
      </div>
      {isOverview ? (
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
      ) : (
        <ResourcePage key={resourceKey} resource={selectedResource} />
      )}
      
      {/* Command Palette */}
      <CommandPalette 
        isOpen={isCommandPaletteOpen} 
        onClose={() => setIsCommandPaletteOpen(false)} 
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
        <App />
      </PanelProvider>
    </ClusterProvider>
  );
}

export default AppWrapper;
