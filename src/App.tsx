import { useState, useEffect } from 'react';
import { Sidebar, type ResourceSelection } from './components/Sidebar';
import { MainContent } from './components/MainContent';
import { builtinResource, preloadAPIResources } from './api/kubernetesTable';

function App() {
  const [selectedResource, setSelectedResource] = useState<ResourceSelection>(builtinResource('pods'));
  const [selectedNamespace, setSelectedNamespace] = useState<string | undefined>(undefined);

  // Create a key for MainContent to force remount when resource changes
  const resourceKey = selectedResource.type === 'builtin' 
    ? selectedResource.kind 
    : `${selectedResource.config.group}/${selectedResource.config.name}`;

  // Preload API resource discovery for proper display names
  useEffect(() => {
    preloadAPIResources();
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-950 text-gray-100">
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
