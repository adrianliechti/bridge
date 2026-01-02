import { useState, useCallback, useEffect, useRef } from 'react';
import { Search } from 'lucide-react';
import type { TableColumnDefinition, TableRow, TableResponse, ResourceConfig } from '../types/table';
import { useColumnVisibility } from '../hooks/useColumnVisibility';
import { usePanels } from '../hooks/usePanelState';
import { ResourceTable } from './ResourceTable';

// Panel IDs
const PANEL_DETAIL = 'detail';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface ResourcePageProps<T = any> {
  // Resource config
  config: ResourceConfig;
  title: string;
  namespace?: string;
  // Data props (fetched by parent)
  data: TableResponse<T> | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
  isRefetching?: boolean;
  // Optional detail panel props
  showDetailPanel?: boolean;
  renderDetailPanel?: (item: TableRow<T>, onClose: () => void, otherPanelOpen: boolean) => React.ReactNode;
  // Optional header actions (e.g., AI button)
  renderHeaderActions?: (columns: TableColumnDefinition[]) => React.ReactNode;
  // Optional extra panels (e.g., ChatPanel)
  renderExtraPanels?: (selectedItem: TableRow<T> | null, isDetailPanelOpen: boolean) => React.ReactNode;
  // URL-driven selection (optional)
  selectedItemName?: string;
  onSelectItemName?: (name: string | undefined) => void;
  getItemName?: (item: TableRow<T>) => string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ResourcePage<T = any>({
  config,
  title,
  namespace,
  data,
  loading,
  error,
  refetch,
  isRefetching = false,
  showDetailPanel = true,
  renderDetailPanel,
  renderHeaderActions,
  renderExtraPanels,
  selectedItemName,
  onSelectItemName,
  getItemName,
}: ResourcePageProps<T>) {
  const [columns, setColumns] = useState<TableColumnDefinition[]>([]);
  const [selectedItem, setSelectedItem] = useState<TableRow<T> | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  
  // Track config and namespace to detect changes during render
  const [trackedConfig, setTrackedConfig] = useState(config);
  const [trackedNamespace, setTrackedNamespace] = useState(namespace);
  
  const { columnVisibility, onColumnVisibilityChange } = useColumnVisibility();
  const { isOpen, open, close } = usePanels();
  
  const isDetailPanelOpen = isOpen(PANEL_DETAIL);

  // Track previous selectedItemName to detect changes
  const prevSelectedItemNameRef = useRef<string | undefined>(undefined);
  const initialSyncDoneRef = useRef(false);

  // Clear selected item and close detail panel when config/namespace changes
  // Detect changes during render to avoid synchronous setState in effects
  const configOrNamespaceChanged = config !== trackedConfig || namespace !== trackedNamespace;
  if (configOrNamespaceChanged) {
    setTrackedConfig(config);
    setTrackedNamespace(namespace);
    setSelectedItem(null);
    close(PANEL_DETAIL);
  }
  
  // Reset initialSyncDoneRef when config/namespace changes (must be in effect, not render)
  useEffect(() => {
    initialSyncDoneRef.current = false;
  }, [config, namespace]);
  
  // Sync selected item from URL when data changes or selectedItemName changes
  useEffect(() => {
    const prevName = prevSelectedItemNameRef.current;
    prevSelectedItemNameRef.current = selectedItemName;
    
    // Use a microtask to avoid synchronous setState in effect
    queueMicrotask(() => {
      if (selectedItemName && data?.rows && getItemName) {
        const item = data.rows.find(row => getItemName(row) === selectedItemName);
        // Open panel if: name changed, or this is the initial sync with a name in URL
        const shouldOpenPanel = item && (prevName !== selectedItemName || !initialSyncDoneRef.current);
        if (shouldOpenPanel) {
          initialSyncDoneRef.current = true;
          setSelectedItem(item);
          if (showDetailPanel) {
            open(PANEL_DETAIL);
          }
        }
      } else if (!selectedItemName && prevName) {
        setSelectedItem(null);
        close(PANEL_DETAIL);
      }
    });
  }, [selectedItemName, data, getItemName, showDetailPanel, open, close]);

  // Sync selected item with detail panel state
  const handleSelectItem = useCallback((item: TableRow<T> | null) => {
    setSelectedItem(item);
    if (item && showDetailPanel) {
      open(PANEL_DETAIL);
      // Update URL if handler provided
      if (onSelectItemName && getItemName) {
        onSelectItemName(getItemName(item));
      }
    } else {
      close(PANEL_DETAIL);
      if (onSelectItemName) {
        onSelectItemName(undefined);
      }
    }
  }, [open, close, showDetailPanel, onSelectItemName, getItemName]);

  const handleColumnsLoaded = useCallback((cols: TableColumnDefinition[]) => {
    setColumns(cols);
  }, []);

  // Calculate right padding for header actions based on which panels are open
  const getHeaderActionsPadding = () => {
    if (isDetailPanelOpen) return 'pr-[40rem]';
    return '';
  };

  return (
    <>
      <main className="flex-1 flex flex-col h-full min-w-0">
        <header className={`shrink-0 h-14 flex items-center justify-between px-5 mt-2 transition-all duration-300 ${getHeaderActionsPadding()}`}>
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-medium text-neutral-900 dark:text-neutral-100">{title}</h2>
          </div>
          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const event = new KeyboardEvent('keydown', {
                  key: 'k',
                  metaKey: true,
                  ctrlKey: true,
                  bubbles: true
                });
                document.dispatchEvent(event);
              }}
              className="p-2 rounded-md text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 dark:text-neutral-500 dark:hover:text-neutral-300 dark:hover:bg-neutral-800 transition-colors"
              title="Command Palette (⌘K)"
            >
              <Search size={18} />
            </button>
            <div ref={toolbarRef} />
            {renderHeaderActions?.(columns)}
          </div>
        </header>
        <section className="flex-1 min-h-0 overflow-hidden">
          <ResourceTable
            config={config}
            data={data}
            loading={loading}
            error={error}
            refetch={refetch}
            isRefetching={isRefetching}
            columnVisibility={columnVisibility}
            onColumnVisibilityChange={onColumnVisibilityChange}
            onColumnsLoaded={handleColumnsLoaded}
            toolbarRef={toolbarRef}
            selectedItem={selectedItem}
            onSelectItem={handleSelectItem}
            namespace={namespace}
          />
        </section>
      </main>
      {/* Extra panels (e.g., ChatPanel) */}
      {renderExtraPanels?.(selectedItem, isDetailPanelOpen)}
      {/* Detail panel */}
      {renderDetailPanel && selectedItem && (
        renderDetailPanel(selectedItem, () => {
          setSelectedItem(null);
          close(PANEL_DETAIL);
          // Navigate back to list URL
          if (onSelectItemName) {
            onSelectItemName(undefined);
          }
        }, false)
      )}
    </>
  );
}
