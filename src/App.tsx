import { useState, useEffect } from 'react';
import { ResourceSidebar, type V1APIResource } from './components/ResourceSidebar';
import { ResourcePage } from './components/ResourcePage';
import { ResourceOverview } from './components/ResourceOverview';
import { WelcomePage } from './components/WelcomePage';
import { preloadDiscovery } from './api/kubernetesDiscovery';
import { PanelProvider } from './context/PanelProvider';

// Special marker for overview view
const OVERVIEW_VIEW = Symbol('OVERVIEW');
type ViewMode = typeof OVERVIEW_VIEW | V1APIResource;

function App() {
  const [selectedView, setSelectedView] = useState<ViewMode>(OVERVIEW_VIEW);
  const [selectedNamespace, setSelectedNamespace] = useState<string | undefined>(undefined);

  // Preload discovery data on mount
  useEffect(() => {
    preloadDiscovery();
  }, []);

  // Handler for sidebar resource selection
  const handleSelectResource = (resource: V1APIResource | null) => {
    if (resource === null) {
      setSelectedView(OVERVIEW_VIEW);
    } else {
      setSelectedView(resource);
    }
  };

  // Check if overview is selected
  const isOverview = selectedView === OVERVIEW_VIEW;

  // Create a key for MainContent to force remount when resource changes
  const resourceKey = isOverview
    ? 'overview'
    : `${(selectedView as V1APIResource).group || ''}/${(selectedView as V1APIResource).name}`;

  return (
    <PanelProvider>
      <div className="flex h-screen overflow-hidden bg-gray-100 text-gray-900 dark:bg-gray-900 dark:text-gray-100 p-2 gap-2">
        <ResourceSidebar
          selectedResource={isOverview ? null : (selectedView as V1APIResource)}
          onSelectResource={handleSelectResource}
          selectedNamespace={selectedNamespace}
          onSelectNamespace={setSelectedNamespace}
          isOverviewSelected={isOverview}
        />
          {isOverview ? (
            <main className="flex-1 flex flex-col h-full min-w-0 bg-white dark:bg-gray-950 rounded-xl overflow-hidden">
              <header className="shrink-0 h-14 flex items-center justify-between px-5">
                <div className="flex items-center gap-4">
                  <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">Overview</h2>
                  {selectedNamespace && (
                    <span className="px-2.5 py-0.5 rounded-md text-xs bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                      {selectedNamespace}
                    </span>
                  )}
                </div>
              </header>
              <section className="flex-1 overflow-hidden min-h-0">
                {selectedNamespace ? (
                  <ResourceOverview namespace={selectedNamespace} />
                ) : (
                  <WelcomePage />
                )}
              </section>
            </main>
          ) : (
            <ResourcePage key={resourceKey} resource={selectedView as V1APIResource} namespace={selectedNamespace} />
          )}
        </div>
    </PanelProvider>
  );
}

export default App;
