import { useState, useEffect, useCallback } from 'react';
import { Sparkles } from 'lucide-react';
import type { ResourceSelection } from '../api/kubernetesTable';
import { getResourceConfigFromSelection, getResourceDisplayName, getResourceDisplayNameSync } from '../api/kubernetesTable';
import type { TableColumnDefinition } from '../types/table';
import { useColumnVisibility } from '../hooks/useColumnVisibility';
import { DynamicResourceTable } from './DynamicResourceTable';
import { ColumnFilter } from './ColumnFilter';
import { AIPanel } from './AIPanel';

interface MainContentProps {
  resource: ResourceSelection;
  namespace?: string;
}

export function MainContent({ resource, namespace }: MainContentProps) {
  const config = getResourceConfigFromSelection(resource);
  const [title, setTitle] = useState(() => getResourceDisplayNameSync(resource));
  const [columns, setColumns] = useState<TableColumnDefinition[]>([]);
  const [isAIPanelOpen, setIsAIPanelOpen] = useState(false);
  
  const { hiddenColumns, toggleColumn } = useColumnVisibility();

  useEffect(() => {
    getResourceDisplayName(resource).then(setTitle);
  }, [resource]);

  const handleColumnsLoaded = useCallback((cols: TableColumnDefinition[]) => {
    setColumns(cols);
  }, []);

  return (
    <>
      <main className={`flex-1 ml-64 flex flex-col h-screen min-w-0 transition-all duration-300 ${isAIPanelOpen ? 'mr-96' : ''}`}>
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
            <button
              onClick={() => setIsAIPanelOpen(!isAIPanelOpen)}
              className={`p-2 rounded-md transition-colors ${
                isAIPanelOpen 
                  ? 'text-sky-400 hover:text-sky-300 hover:bg-gray-800' 
                  : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
              }`}
              title="AI Assistant"
            >
              <Sparkles size={18} />
            </button>
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
      <AIPanel isOpen={isAIPanelOpen} onClose={() => setIsAIPanelOpen(false)} />
    </>
  );
}
