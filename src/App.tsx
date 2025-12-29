import { useCallback } from 'react';
import { ResourceSidebar, type V1APIResource } from './components/ResourceSidebar';
import { ResourcePage } from './components/ResourcePage';
import { ResourceOverview } from './components/ResourceOverview';
import { WelcomePage } from './components/WelcomePage';
import { PanelProvider } from './context/PanelProvider';
import { ClusterProvider } from './context/ClusterProvider';
import { useCluster } from './hooks/useCluster';

function AppContent() {
  const { namespace, selectedResource, setSelectedResource } = useCluster();

  // Handler for sidebar resource selection
  const handleSelectResource = useCallback((resource: V1APIResource | null) => {
    setSelectedResource(resource);
  }, [setSelectedResource]);

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
