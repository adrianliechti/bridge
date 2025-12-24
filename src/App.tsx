import { useState, useEffect } from 'react';
import { Sidebar, type V1APIResource } from './components/Sidebar';
import { MainContent } from './components/MainContent';
import { preloadDiscovery } from './api/kubernetesDiscovery';
import { getResourceConfig } from './api/kubernetes';

function App() {
  const [selectedResource, setSelectedResource] = useState<V1APIResource | null>(null);
  const [selectedNamespace, setSelectedNamespace] = useState<string | undefined>(undefined);

  // Load initial resource (pods) from discovery
  useEffect(() => {
    preloadDiscovery();
    getResourceConfig('pods').then((config) => {
      if (config) {
        setSelectedResource(config);
      }
    });
  }, []);

  // Create a key for MainContent to force remount when resource changes
  const resourceKey = selectedResource
    ? `${selectedResource.group || ''}/${selectedResource.name}`
    : 'loading';

  if (!selectedResource) {
    return (
      <div className="flex h-screen overflow-hidden bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100 items-center justify-center">
        <div className="text-gray-600 dark:text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <Sidebar
        selectedResource={selectedResource}
        onSelectResource={setSelectedResource}
        selectedNamespace={selectedNamespace}
        onSelectNamespace={setSelectedNamespace}
      />
      <MainContent key={resourceKey} resource={selectedResource} namespace={selectedNamespace} />
    </div>
  );
}

export default App;
