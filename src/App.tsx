import { useState } from 'react';
import { Sidebar, type ResourceType } from './components/Sidebar';
import { MainContent } from './components/MainContent';
import './App.css';

function App() {
  const [selectedResource, setSelectedResource] = useState<ResourceType>('pods');
  const [selectedNamespace, setSelectedNamespace] = useState<string | undefined>(undefined);

  return (
    <div className="app">
      <Sidebar
        selectedResource={selectedResource}
        onSelectResource={setSelectedResource}
        selectedNamespace={selectedNamespace}
        onSelectNamespace={setSelectedNamespace}
      />
      <MainContent resourceType={selectedResource} namespace={selectedNamespace} />
    </div>
  );
}

export default App;
