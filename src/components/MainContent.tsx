import { useState, useEffect } from 'react';
import type { ResourceSelection } from '../api/kubernetesTable';
import { getResourceConfigFromSelection, getResourceDisplayName, getResourceDisplayNameSync } from '../api/kubernetesTable';
import { DynamicResourceTable } from './DynamicResourceTable';

interface MainContentProps {
  resource: ResourceSelection;
  namespace?: string;
}

export function MainContent({ resource, namespace }: MainContentProps) {
  const config = getResourceConfigFromSelection(resource);
  
  // Use sync version for initial render, then update with async version
  const [title, setTitle] = useState(() => getResourceDisplayNameSync(resource));

  useEffect(() => {
    getResourceDisplayName(resource).then(setTitle);
  }, [resource]);

  return (
    <main className="flex-1 ml-64 flex flex-col min-h-screen">
      <header className="flex items-center justify-between px-6 py-5 bg-gray-900 border-b border-gray-800">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-semibold text-gray-100">{title}</h2>
          {resource.type === 'crd' && (
            <span className="px-3 py-1 rounded-full text-xs bg-gray-700/50 text-gray-400">
              {resource.config.group}
            </span>
          )}
          {namespace && (
            <span className="px-3 py-1 rounded-full text-xs bg-gray-800 text-gray-400">
              Namespace: {namespace}
            </span>
          )}
        </div>
      </header>
      <section className="flex-1 p-6 overflow-x-auto">
        <DynamicResourceTable
          config={config}
          namespace={namespace}
        />
      </section>
    </main>
  );
}
