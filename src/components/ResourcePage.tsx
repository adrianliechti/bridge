import { useState, useEffect, useCallback } from 'react';
import { Sparkles } from 'lucide-react';
import type { V1APIResource } from '../api/kubernetesTable';
import type { TableColumnDefinition, TableRow } from '../types/table';
import { useColumnVisibility } from '../hooks/useColumnVisibility';
import { usePanels } from '../hooks/usePanelState';
import { ResourceTable } from './ResourceTable';
import { ColumnFilter } from './ColumnFilter';
import { AIPanel } from './AIPanel';
import { ResourcePanel } from './ResourcePanel';
import { getConfig } from '../config';

// Panel IDs
const PANEL_AI = 'ai';
const PANEL_DETAIL = 'detail';

function getDisplayName(resource: V1APIResource): string {
  return resource.name.charAt(0).toUpperCase() + resource.name.slice(1);
}

interface ResourcePageProps {
  resource: V1APIResource;
  namespace?: string;
}

export function ResourcePage({ resource, namespace }: ResourcePageProps) {
  const [title, setTitle] = useState(() => getDisplayName(resource));
  const [columns, setColumns] = useState<TableColumnDefinition[]>([]);
  const [selectedItem, setSelectedItem] = useState<TableRow | null>(null);
  
  const { hiddenColumns, toggleColumn } = useColumnVisibility();
  const { isOpen, open, close, toggle } = usePanels();
  
  const isAIPanelOpen = isOpen(PANEL_AI);
  const isDetailPanelOpen = isOpen(PANEL_DETAIL);

  useEffect(() => {
    setTitle(getDisplayName(resource));
  }, [resource]);

  // Clear selected item and close detail panel when resource changes
  useEffect(() => {
    setSelectedItem(null);
    close(PANEL_DETAIL);
  }, [resource, namespace, close]);

  // Sync selected item with detail panel state
  const handleSelectItem = useCallback((item: TableRow | null) => {
    setSelectedItem(item);
    if (item) {
      open(PANEL_DETAIL);
    } else {
      close(PANEL_DETAIL);
    }
  }, [open, close]);

  const handleColumnsLoaded = useCallback((cols: TableColumnDefinition[]) => {
    setColumns(cols);
  }, []);

  // Calculate right padding for header actions based on which panels are open
  const getHeaderActionsPadding = () => {
    const openPanelCount = [isDetailPanelOpen, isAIPanelOpen].filter(Boolean).length;
    if (openPanelCount >= 2) return 'pr-[56rem]'; // 28rem + 28rem
    if (openPanelCount === 1) return 'pr-[40rem]';
    return '';
  };

  return (
    <>
      <main className="flex-1 flex flex-col h-full min-w-0">
        <header className={`shrink-0 h-14 flex items-center justify-between px-5 mt-2 transition-all duration-300 ${getHeaderActionsPadding()}`}>
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-medium text-neutral-900 dark:text-neutral-100">{title}</h2>
            {namespace && (
              <span className="px-2.5 py-0.5 rounded-md text-xs bg-neutral-200/80 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                {namespace}
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
                onClick={() => toggle(PANEL_AI)}
                className={`p-2 rounded-md transition-colors ${
                  isAIPanelOpen 
                    ? 'text-sky-400 hover:text-sky-300 hover:bg-neutral-100 dark:hover:bg-neutral-800' 
                    : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 dark:text-neutral-500 dark:hover:text-neutral-300 dark:hover:bg-neutral-800'
                }`}
                title="AI Assistant"
              >
                <Sparkles size={18} />
              </button>
            )}
          </div>
        </header>
        <section className="flex-1 min-h-0 overflow-hidden">
          <ResourceTable
            config={resource}
            namespace={namespace}
            hiddenColumns={hiddenColumns}
            onColumnsLoaded={handleColumnsLoaded}
            selectedItem={selectedItem}
            onSelectItem={handleSelectItem}
          />
        </section>
      </main>
      <AIPanel 
        isOpen={isAIPanelOpen}
        onClose={() => close(PANEL_AI)}
        otherPanelOpen={isDetailPanelOpen}
        context={{
          currentNamespace: selectedItem?.object.metadata.namespace || namespace || 'all namespaces',
          selectedResourceKind: resource.group 
            ? `${resource.kind} (${resource.group}/${resource.version})` 
            : `${resource.kind} (${resource.version})`,
          selectedResourceName: selectedItem?.object.metadata.name,
        }}
      />
      <ResourcePanel
        isOpen={isDetailPanelOpen}
        onClose={() => {
          setSelectedItem(null);
          close(PANEL_DETAIL);
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
