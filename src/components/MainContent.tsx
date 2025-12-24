import { useState, useEffect, useCallback } from 'react';
import type { ResourceSelection } from '../api/kubernetesTable';
import { getResourceConfigFromSelection, getResourceDisplayName, getResourceDisplayNameSync } from '../api/kubernetesTable';
import type { TableColumnDefinition } from '../types/table';
import { useColumnVisibility } from '../hooks/useColumnVisibility';
import { DynamicResourceTable } from './DynamicResourceTable';
import { ColumnFilter } from './ColumnFilter';

interface MainContentProps {
  resource: ResourceSelection;
  namespace?: string;
}

export function MainContent({ resource, namespace }: MainContentProps) {
  const config = getResourceConfigFromSelection(resource);
  const [title, setTitle] = useState(() => getResourceDisplayNameSync(resource));
  const [columns, setColumns] = useState<TableColumnDefinition[]>([]);
  
  // Create a key to reset column visibility when resource changes
  const resourceKey = resource.type === 'builtin' 
    ? resource.kind 
    : `${resource.config.group}/${resource.config.plural}`;
  
  const { hiddenColumns, toggleColumn } = useColumnVisibility(resourceKey);

  useEffect(() => {
    getResourceDisplayName(resource).then(setTitle);
  }, [resource]);

  // Reset columns when resource changes
  useEffect(() => {
    setColumns([]);
  }, [resource]);

  const handleColumnsLoaded = useCallback((cols: TableColumnDefinition[]) => {
    setColumns(cols);
  }, []);

  return (
    <main className="flex-1 ml-64 flex flex-col h-screen w-[calc(100%-16rem)] min-w-0">
      <header className="shrink-0 h-16 flex items-center justify-between px-5 bg-gray-900 border-b border-gray-800">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-semibold text-gray-100">{title}</h2>
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
        {/* Actions */}
        <div className="flex items-center gap-2">
          <ColumnFilter
            columns={columns}
            hiddenColumns={hiddenColumns}
            onToggleColumn={toggleColumn}
          />
        </div>
      </header>
      <section className="flex-1 overflow-auto min-h-0">
        <div className="p-6 min-w-fit">
          <DynamicResourceTable
            config={config}
            namespace={namespace}
            hiddenColumns={hiddenColumns}
            onColumnsLoaded={handleColumnsLoaded}
          />
        </div>
      </section>
    </main>
  );
}
