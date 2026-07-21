import { useState, useCallback, useMemo, useRef } from 'react';
import { Search } from 'lucide-react';
import type {
  TableColumnDefinition,
  TableRow,
  TableResponse,
  ResourceConfig,
} from '../types/table';
import { getObjectId } from '../types/table';
import { useColumnVisibility } from '../hooks/useColumnVisibility';
import { ResourceTable } from './ResourceTable';

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
  renderDetailPanel?: (
    item: TableRow<T>,
    onClose: () => void,
    otherPanelOpen: boolean,
  ) => React.ReactNode;
  // Optional header actions (e.g., AI button), rendered left of the search button
  renderHeaderActions?: (columns: TableColumnDefinition[]) => React.ReactNode;
  // Chat panel state (for header padding calculation)
  isChatPanelOpen?: boolean;
  // URL-driven selection
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
  isChatPanelOpen = false,
  selectedItemName,
  onSelectItemName,
  getItemName,
}: ResourcePageProps<T>) {
  const [columns, setColumns] = useState<TableColumnDefinition[]>([]);
  const toolbarRef = useRef<HTMLDivElement>(null);

  // The exact row the user last clicked. Only used to disambiguate when
  // several rows share the same URL name (e.g. same pod name in different
  // namespaces with "all namespaces" selected) — the URL stays the source
  // of truth for WHETHER something is selected.
  const [clickedItem, setClickedItem] = useState<TableRow<T> | null>(null);

  const { columnVisibility, onColumnVisibilityChange } = useColumnVisibility();

  // Derive the selected row from the URL and the latest data. Re-resolving
  // against `data` on every render keeps the detail panel in sync with
  // background refetches instead of holding a stale row snapshot.
  const selectedItem = useMemo<TableRow<T> | null>(() => {
    if (!selectedItemName || !getItemName) return null;
    const rows = data?.rows;
    if (!rows) return null;
    if (clickedItem && getItemName(clickedItem) === selectedItemName) {
      const clickedId = getObjectId(clickedItem.object);
      const fresh = rows.find((row) => getObjectId(row.object) === clickedId);
      if (fresh) return fresh;
      // Clicked row no longer exists in the current data (deleted or the
      // namespace filter changed) — fall through to a plain name lookup.
    }
    return rows.find((row) => getItemName(row) === selectedItemName) ?? null;
  }, [selectedItemName, clickedItem, data, getItemName]);

  const isDetailPanelOpen = showDetailPanel && !!selectedItem;

  const handleSelectItem = useCallback(
    (item: TableRow<T> | null) => {
      setClickedItem(item);
      if (onSelectItemName && getItemName) {
        onSelectItemName(item ? getItemName(item) : undefined);
      }
    },
    [onSelectItemName, getItemName],
  );

  const handleCloseDetailPanel = useCallback(() => {
    setClickedItem(null);
    onSelectItemName?.(undefined);
  }, [onSelectItemName]);

  const handleColumnsLoaded = useCallback((cols: TableColumnDefinition[]) => {
    setColumns(cols);
  }, []);

  // Calculate right padding for header actions based on which panels are open
  const getHeaderActionsPadding = () => {
    if (isDetailPanelOpen && isChatPanelOpen) return 'pr-[68rem]'; // Both panels: 40rem + 28rem
    if (isDetailPanelOpen) return 'pr-[40rem]';
    if (isChatPanelOpen) return 'pr-[28rem]';
    return '';
  };

  return (
    <>
      <main className="flex-1 flex flex-col h-full min-w-0">
        <header
          className={`shrink-0 h-14 flex items-center justify-between px-5 mt-2 transition-all duration-300 ${getHeaderActionsPadding()}`}
        >
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-medium text-neutral-900 dark:text-neutral-100">{title}</h2>
          </div>
          {/* Actions */}
          <div className="flex items-center gap-2">
            {renderHeaderActions?.(columns)}
            <div ref={toolbarRef} />
            <button
              onClick={() => {
                const event = new KeyboardEvent('keydown', {
                  key: 'k',
                  metaKey: true,
                  ctrlKey: true,
                  bubbles: true,
                });
                document.dispatchEvent(event);
              }}
              className="p-2 rounded-md text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 dark:text-neutral-500 dark:hover:text-neutral-300 dark:hover:bg-neutral-800 transition-colors"
              title="Command Palette (⌘K)"
            >
              <Search size={18} />
            </button>
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
      {/* Detail panel */}
      {renderDetailPanel &&
        isDetailPanelOpen &&
        selectedItem &&
        renderDetailPanel(selectedItem, handleCloseDetailPanel, isChatPanelOpen)}
    </>
  );
}
