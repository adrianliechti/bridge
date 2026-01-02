import { useMemo, useEffect, useCallback, useState } from 'react';
import { AlertTriangle, ChevronUp, ChevronDown, ChevronsUpDown, RefreshCw } from 'lucide-react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type ColumnDef,
  type SortingState,
  type RowSelectionState,
  type OnChangeFn,
  type VisibilityState,
} from '@tanstack/react-table';
import type { TableColumnDefinition, TableRow, TableResponse, ResourceConfig } from '../types/table';
import { getObjectId as getIdHelper, getObjectNamespace as getNamespaceHelper } from '../types/table';
import { ColumnFilter } from './ColumnFilter';
import { ToolbarPortal } from './ToolbarPortal';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const columnHelper = createColumnHelper<TableRow<any>>();

// Check if column likely contains status information
function isStatusColumn(name: string): boolean {
  const lowerName = name.toLowerCase();
  return lowerName === 'status' || lowerName === 'phase' || lowerName === 'ready' || lowerName === 'condition';
}

// Get status color classes based on value
function getStatusClasses(value: string): { text: string; dot: string } {
  const lower = value.toLowerCase();
  if (lower.match(/running|active|ready|available|bound|succeeded|complete|healthy|true/)) {
    return { text: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' };
  }
  if (lower.match(/pending|creating|waiting|progressing|scheduled/)) {
    return { text: 'text-amber-600 dark:text-amber-400', dot: 'bg-amber-500' };
  }
  if (lower.match(/failed|error|crashloopbackoff|terminated|unknown|lost|false/)) {
    return { text: 'text-red-600 dark:text-red-400', dot: 'bg-red-500' };
  }
  return { text: 'text-neutral-500 dark:text-neutral-400', dot: 'bg-neutral-400' };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface ResourceTableProps<T = any> {
  config: ResourceConfig;
  data: TableResponse<T> | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
  isRefetching?: boolean;
  columnVisibility: VisibilityState;
  onColumnVisibilityChange: OnChangeFn<VisibilityState>;
  onColumnsLoaded?: (columns: TableColumnDefinition[]) => void;
  toolbarRef?: React.RefObject<HTMLDivElement | null>;
  selectedItem?: TableRow<T> | null;
  onSelectItem?: (item: TableRow<T> | null) => void;
  namespace?: string; // Current namespace filter (undefined = all namespaces)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ResourceTable<T = any>({
  config,
  data,
  loading,
  error,
  refetch,
  isRefetching = false,
  columnVisibility,
  onColumnVisibilityChange,
  onColumnsLoaded,
  toolbarRef,
  selectedItem,
  onSelectItem,
  namespace,
}: ResourceTableProps<T>) {
  // Check if we should show the namespace column (when all namespaces is selected and resource is namespaced)
  const showNamespaceColumn = namespace === undefined && config.namespaced === true;

  // Build columns dynamically from API column definitions
  const columns = useMemo(() => {
    if (!data?.columnDefinitions) return [];

    const cols: ColumnDef<TableRow<T>, unknown>[] = [];
    const apiColumns = data.columnDefinitions;

    apiColumns.forEach((colDef, idx) => {
      const isStatus = isStatusColumn(colDef.name);
      const isName = colDef.name.toLowerCase() === 'name';
      const isDateTime = colDef.format === 'date-time';

      cols.push(
        columnHelper.accessor((row) => row.cells[idx], {
          id: colDef.name.toLowerCase(),
          header: colDef.name,
          sortingFn: isDateTime ? 'datetime' : 'auto',
          sortUndefined: 'last',
          cell: (info) => {
            const value = info.getValue();

            // Format the value
            let formatted: string;
            if (value === null || value === undefined) {
              formatted = '<none>';
            } else if (isDateTime && typeof value === 'string') {
              // Inline age formatting
              // Note: Age values (e.g., "5m", "2h") are calculated on each cell render.
              // They update automatically when the table re-renders (e.g., due to data refetch,
              // sorting, filtering). The refetchInterval in query configuration ensures periodic
              // updates. If more frequent age updates are needed without refetching data, consider
              // adding a separate interval timer to trigger re-renders.
              const created = new Date(value);
              const now = new Date();
              const diffMs = now.getTime() - created.getTime();
              const seconds = Math.floor(diffMs / 1000);
              const minutes = Math.floor(seconds / 60);
              const hours = Math.floor(minutes / 60);
              const days = Math.floor(hours / 24);
              if (days > 0) formatted = `${days}d`;
              else if (hours > 0) formatted = `${hours}h`;
              else if (minutes > 0) formatted = `${minutes}m`;
              else formatted = `${seconds}s`;
            } else if (Array.isArray(value)) {
              formatted = value.length > 0 ? value.join(', ') : '<none>';
            } else if (typeof value === 'object') {
              formatted = JSON.stringify(value);
            } else {
              formatted = String(value);
            }

            // Status column with colored badge
            if (isStatus) {
              const { text, dot } = getStatusClasses(formatted);
              return (
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium capitalize ${text}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                  {formatted}
                </span>
              );
            }

            // Name column styling
            if (isName) {
              return <span className="text-neutral-900 dark:text-neutral-300">{formatted}</span>;
            }

            return <span className="text-neutral-500 dark:text-neutral-500">{formatted}</span>;
          },
          meta: { description: colDef.description, format: colDef.format },
        }) as ColumnDef<TableRow<T>, unknown>
      );

      // Insert synthetic Namespace column after Name
      if (isName && showNamespaceColumn) {
        cols.push(
          columnHelper.accessor((row) => getNamespaceHelper(row.object), {
            id: 'Namespace',
            header: 'Namespace',
            sortingFn: 'alphanumeric',
            sortUndefined: 'last',
            cell: (info) => {
              const value = info.getValue() ?? '<none>';
              return <span className="text-neutral-500 dark:text-neutral-500">{value}</span>;
            },
            meta: { description: 'Namespace of the resource', format: '' },
          }) as ColumnDef<TableRow<T>, unknown>
        );
      }
    });

    return cols;
  }, [data?.columnDefinitions, showNamespaceColumn]);

  // Derive row selection state from selectedItem prop
  const rowSelection = useMemo<RowSelectionState>(() => {
    if (!selectedItem) return {};
    const rowId = getIdHelper(selectedItem.object);
    return { [rowId]: true };
  }, [selectedItem]);

  // Handle row selection changes and sync to external state
  const handleRowSelectionChange: OnChangeFn<RowSelectionState> = useCallback(
    (updater) => {
      const newSelection = typeof updater === 'function' ? updater(rowSelection) : updater;
      const selectedIds = Object.keys(newSelection).filter((id) => newSelection[id]);

      if (selectedIds.length === 0) {
        onSelectItem?.(null);
      } else {
        const row = data?.rows.find((r) => getIdHelper(r.object) === selectedIds[0]);
        onSelectItem?.(row ?? null);
      }
    },
    [data?.rows, onSelectItem, rowSelection]
  );

  // Sorting state
  const [sorting, setSorting] = useState<SortingState>([]);

  // Create the table instance
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table returns non-memoizable functions by design
  const table = useReactTable({
    data: data?.rows ?? [],
    columns,
    state: {
      sorting,
      rowSelection,
      columnVisibility,
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    onRowSelectionChange: handleRowSelectionChange,
    onColumnVisibilityChange,
    enableRowSelection: true,
    enableMultiRowSelection: false,
    getRowId: (row) => getIdHelper(row.object),
  });

  // Notify parent of columns when data loads
  useEffect(() => {
    if (data?.columnDefinitions && onColumnsLoaded) {
      onColumnsLoaded(data.columnDefinitions);
    }
  }, [data, onColumnsLoaded]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-neutral-400 dark:text-neutral-500">
          <div className="w-6 h-6 border-2 border-neutral-200 border-t-neutral-400 dark:border-neutral-700 dark:border-t-neutral-500 rounded-full animate-spin" />
          <span className="text-sm">Loading {config.name}...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex items-center gap-3 text-red-500 dark:text-red-400">
          <AlertTriangle size={18} />
          <span className="text-sm">{error.message}</span>
          <button 
            onClick={refetch} 
            className="px-3 py-1.5 text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 underline underline-offset-2"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data || !data.columnDefinitions || data.rows.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center text-neutral-400 dark:text-neutral-500">
          <svg className="w-8 h-8 mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
          <span className="text-sm">No resources found</span>
        </div>
      </div>
    );
  }

  return (
    <div className="pl-2 h-full relative">
      {/* Refetch indicator */}
      {isRefetching && (
        <div className="absolute top-2 right-4 z-20">
          <RefreshCw size={14} className="text-neutral-400 dark:text-neutral-500 animate-spin" />
        </div>
      )}
      <div className="overflow-auto h-full">
        <table className="w-full text-[13px]">
          <thead className="sticky top-0 z-10 bg-neutral-100 dark:bg-neutral-950">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const isSorted = header.column.getIsSorted();
                  const meta = header.column.columnDef.meta as { description?: string } | undefined;
                  return (
                    <th
                      key={header.id}
                      title={meta?.description}
                      onClick={header.column.getToggleSortingHandler()}
                      className={`text-left px-4 py-2 text-[11px] font-medium whitespace-nowrap cursor-pointer transition-colors select-none group bg-neutral-100 dark:bg-neutral-950 ${
                        isSorted
                          ? 'text-neutral-900 dark:text-neutral-200'
                          : 'text-neutral-500 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-400'
                      }`}
                    >
                      <div className="flex items-center gap-1">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        <span className={`transition-opacity ${isSorted ? 'opacity-100' : 'opacity-0 group-hover:opacity-40'}`}>
                          {isSorted === 'asc' ? (
                            <ChevronUp size={12} />
                          ) : isSorted === 'desc' ? (
                            <ChevronDown size={12} />
                          ) : (
                            <ChevronsUpDown size={12} />
                          )}
                        </span>
                      </div>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row, rowIndex) => {
              const isSelected = row.getIsSelected();
              const isOdd = rowIndex % 2 === 1;
              const visibleCells = row.getVisibleCells();
              return (
                <tr
                  key={row.id}
                  onClick={row.getToggleSelectedHandler()}
                  className={`transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-blue-500/20 dark:bg-blue-500/20'
                      : isOdd
                        ? 'bg-neutral-200/40 dark:bg-neutral-800/30 hover:bg-neutral-200/70 dark:hover:bg-neutral-800/50'
                        : 'hover:bg-neutral-200/50 dark:hover:bg-neutral-800/30'
                  }`}
                >
                  {visibleCells.map((cell, idx) => (
                    <td
                      key={cell.id}
                      className={`px-4 py-2 whitespace-nowrap ${idx === 0 ? 'rounded-l-lg' : ''} ${idx === visibleCells.length - 1 ? 'rounded-r-lg' : ''}`}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* Render ColumnFilter into the toolbar via portal */}
      {toolbarRef && (
        <ToolbarPortal toolbarRef={toolbarRef}>
          <ColumnFilter columns={table.getAllLeafColumns()} />
        </ToolbarPortal>
      )}
    </div>
  );
}
