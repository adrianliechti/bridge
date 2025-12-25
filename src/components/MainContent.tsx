import { useState, useEffect, useCallback } from 'react';
import { Sparkles } from 'lucide-react';
import type { V1APIResource } from '../api/kubernetesTable';
import type { TableColumnDefinition, TableRow } from '../types/table';
import { useColumnVisibility } from '../hooks/useColumnVisibility';
import { usePanels } from '../hooks/usePanelState';
import { DynamicResourceTable } from './DynamicResourceTable';
import { ColumnFilter } from './ColumnFilter';
import { AIPanel } from './AIPanel';
import { DetailPanel } from './DetailPanel';
import { getConfig } from '../config';

// Panel IDs
const PANEL_AI = 'ai';
const PANEL_DETAIL = 'detail';

function getDisplayName(resource: V1APIResource): string {
  return resource.name.charAt(0).toUpperCase() + resource.name.slice(1);
}

interface MainContentProps {
  resource: V1APIResource;
  namespace?: string;
}

export function MainContent({ resource, namespace }: MainContentProps) {
  const [title, setTitle] = useState(() => getDisplayName(resource));
  const [columns, setColumns] = useState<TableColumnDefinition[]>([]);
  const [selectedItem, setSelectedItem] = useState<TableRow | null>(null);
  
  const { hiddenColumns, toggleColumn } = useColumnVisibility();
  const panels = usePanels();
  
  const isAIPanelOpen = panels.isOpen(PANEL_AI);
  const isDetailPanelOpen = panels.isOpen(PANEL_DETAIL);

  useEffect(() => {
    setTitle(getDisplayName(resource));
  }, [resource]);

  // Clear selected item and close detail panel when resource changes
  useEffect(() => {
    setSelectedItem(null);
    panels.close(PANEL_DETAIL);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resource, namespace]);

  // Sync selected item with detail panel state
  const handleSelectItem = useCallback((item: TableRow | null) => {
    setSelectedItem(item);
    if (item) {
      panels.open(PANEL_DETAIL);
    } else {
      panels.close(PANEL_DETAIL);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleColumnsLoaded = useCallback((cols: TableColumnDefinition[]) => {
    setColumns(cols);
  }, []);

  // Calculate right margin based on which panels are open
  const getRightMargin = () => {
    if (isDetailPanelOpen && isAIPanelOpen) return 'mr-[56rem]'; // 28rem + 28rem
    if (isDetailPanelOpen || isAIPanelOpen) return 'mr-[40rem]';
    return '';
  };

  return (
    <>
      <main className={`flex-1 ml-64 flex flex-col h-screen min-w-0 transition-all duration-300 ${getRightMargin()}`}>
        <header className="shrink-0 h-16 flex items-center justify-between px-5 bg-white border-b border-gray-200 dark:bg-gray-900 dark:border-gray-800">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
            {namespace && (
              <span className="px-3 py-1 rounded-full text-xs bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
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
            {getConfig().ai && (
              <button
                onClick={() => panels.toggle(PANEL_AI)}
                className={`p-2 rounded-md transition-colors ${
                  isAIPanelOpen 
                    ? 'text-sky-400 hover:text-sky-300 hover:bg-gray-100 dark:hover:bg-gray-800' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-500 dark:hover:text-gray-300 dark:hover:bg-gray-800'
                }`}
                title="AI Assistant"
              >
                <Sparkles size={18} />
              </button>
            )}
          </div>
        </header>
        <section className="flex-1 overflow-auto min-h-0">
          <div className="p-6 min-w-fit">
            <DynamicResourceTable
              config={resource}
              namespace={namespace}
              hiddenColumns={hiddenColumns}
              onColumnsLoaded={handleColumnsLoaded}
              selectedItem={selectedItem}
              onSelectItem={handleSelectItem}
            />
          </div>
        </section>
      </main>
      <AIPanel 
        isOpen={isAIPanelOpen}
        onClose={() => panels.close(PANEL_AI)}
        otherPanelOpen={isDetailPanelOpen}
        context={{
          currentNamespace: namespace,
          selectedResourceKind: resource.name,
          selectedResourceName: selectedItem?.object.metadata.name,
        }}
      />
      <DetailPanel
        isOpen={isDetailPanelOpen}
        onClose={() => {
          setSelectedItem(null);
          panels.close(PANEL_DETAIL);
        }}
        otherPanelOpen={isAIPanelOpen}
        resource={selectedItem ? {
          name: selectedItem.object.metadata.name,
          namespace: selectedItem.object.metadata.namespace,
          uid: selectedItem.object.metadata.uid,
          resourceVersion: selectedItem.object.metadata.resourceVersion,
          kind: resource.kind,
          apiVersion: resource.group ? `${resource.group}/${resource.version}` : resource.version,
        } : null}
      />
    </>
  );
}
