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
    <main className="main-content">
      <header className="content-header">
        <div className="header-left">
          <h2>{title}</h2>
          {resource.type === 'crd' && (
            <span className="api-group-badge">{resource.config.group}</span>
          )}
          {namespace && <span className="namespace-badge">Namespace: {namespace}</span>}
        </div>
      </header>
      <section className="content-body">
        <DynamicResourceTable
          config={config}
          namespace={namespace}
        />
      </section>
    </main>
  );
}
