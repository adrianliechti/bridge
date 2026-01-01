import { useMemo, useEffect, useState } from 'react';
import { AlertTriangle, ChevronUp, ChevronDown, ChevronsUpDown, RefreshCw } from 'lucide-react';
import type { TableColumnDefinition, TableRow, TableResponse, ResourceConfig } from '../types/table';
import { getObjectId as getIdHelper, getObjectNamespace as getNamespaceHelper } from '../types/table';

// Sort direction type
type SortDirection = 'asc' | 'desc' | null;

// Sort state
interface SortState {
  column: string | null;
  direction: SortDirection;
}

// Format cell value based on column type
function formatCell(value: unknown, column: TableColumnDefinition): string {
  if (value === null || value === undefined) {
    return '<none>';
  }

  if (column.format === 'date-time' && typeof value === 'string') {
    return formatAge(value);
  }

  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(', ') : '<none>';
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

// Calculate age from timestamp (same as kubectl)
function formatAge(timestamp: string): string {
  const created = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

// Check if column likely contains status information
function isStatusColumn(column: TableColumnDefinition): boolean {
  const name = column.name.toLowerCase();
  return name === 'status' || name === 'phase' || name === 'ready' || name === 'condition';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface ResourceTableProps<T = any> {
  config: ResourceConfig;
  data: TableResponse<T> | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
  isRefetching?: boolean;
  hiddenColumns: Set<string>;
  onColumnsLoaded?: (columns: TableColumnDefinition[]) => void;
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
  hiddenColumns,
  onColumnsLoaded,
  selectedItem,
  onSelectItem,
  namespace,
}: ResourceTableProps<T>) {
  const [sortState, setSortState] = useState<SortState>({ column: null, direction: null });

  // Check if we should show the namespace column (when all namespaces is selected and resource is namespaced)
  const showNamespaceColumn = namespace === undefined && config.namespaced === true;

  // Namespace column definition for "all namespaces" view
  const namespaceColumn: TableColumnDefinition = useMemo(() => ({
    name: 'Namespace',
    type: 'string',
    format: '',
    description: 'Namespace of the resource',
    priority: 0,
  }), []);

  // Get visible columns
  const visibleColumns = useMemo(() => {
    if (!data?.columnDefinitions) return [];
    const columns = data.columnDefinitions.filter((col) => !hiddenColumns.has(col.name.toLowerCase()));
    
    // Insert namespace column after Name column when showing all namespaces
    if (showNamespaceColumn && !hiddenColumns.has('namespace')) {
      const nameIndex = columns.findIndex(col => col.name.toLowerCase() === 'name');
      if (nameIndex !== -1) {
        return [
          ...columns.slice(0, nameIndex + 1),
          namespaceColumn,
          ...columns.slice(nameIndex + 1),
        ];
      }
    }
    
    return columns;
  }, [data, hiddenColumns, showNamespaceColumn, namespaceColumn]);

  // Sort rows
  const sortedRows = useMemo(() => {
    if (!data?.rows || !sortState.column || !sortState.direction) {
      return data?.rows ?? [];
    }

    // Handle synthetic Namespace column
    const isSortingNamespace = sortState.column === 'Namespace' && showNamespaceColumn;
    
    if (isSortingNamespace) {
      return [...data.rows].sort((a, b) => {
        const aVal = getNamespaceHelper(a.object) || '';
        const bVal = getNamespaceHelper(b.object) || '';
        const comparison = aVal.localeCompare(bVal);
        return sortState.direction === 'asc' ? comparison : -comparison;
      });
    }

    const columnIndex = data.columnDefinitions.findIndex(
      (c) => c.name === sortState.column
    );
    if (columnIndex === -1) return data.rows;

    const column = data.columnDefinitions[columnIndex];
    
    return [...data.rows].sort((a, b) => {
      const aVal = a.cells[columnIndex];
      const bVal = b.cells[columnIndex];
      
      // Handle null/undefined
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return sortState.direction === 'asc' ? -1 : 1;
      if (bVal == null) return sortState.direction === 'asc' ? 1 : -1;
      
      let comparison = 0;
      
      // Date comparison
      if (column.format === 'date-time') {
        const aDate = new Date(String(aVal)).getTime();
        const bDate = new Date(String(bVal)).getTime();
        comparison = aDate - bDate;
      }
      // Numeric comparison
      else if (typeof aVal === 'number' && typeof bVal === 'number') {
        comparison = aVal - bVal;
      }
      // String comparison
      else {
        comparison = String(aVal).localeCompare(String(bVal));
      }
      
      return sortState.direction === 'asc' ? comparison : -comparison;
    });
  }, [data, sortState, showNamespaceColumn]);

  // Handle column header click for sorting
  const handleSort = (columnName: string) => {
    setSortState(prev => {
      if (prev.column !== columnName) {
        return { column: columnName, direction: 'asc' };
      }
      if (prev.direction === 'asc') {
        return { column: columnName, direction: 'desc' };
      }
      return { column: null, direction: null };
    });
  };

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
            <tr>
              {visibleColumns.map((col, idx) => {
                const isSorted = sortState.column === col.name;
                return (
                  <th 
                    key={idx} 
                    title={col.description}
                    onClick={() => handleSort(col.name)}
                    className={`text-left px-4 py-2 text-[11px] font-medium whitespace-nowrap cursor-pointer transition-colors select-none group bg-neutral-100 dark:bg-neutral-950 ${
                      isSorted 
                        ? 'text-neutral-900 dark:text-neutral-200' 
                        : 'text-neutral-500 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-400'
                    }`}
                  >
                    <div className="flex items-center gap-1">
                      {col.name}
                      <span className={`transition-opacity ${isSorted ? 'opacity-100' : 'opacity-0 group-hover:opacity-40'}`}>
                        {isSorted && sortState.direction === 'asc' ? (
                          <ChevronUp size={12} />
                        ) : isSorted && sortState.direction === 'desc' ? (
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
          </thead>
          <tbody>
            {sortedRows.map((row: TableRow<T>, rowIndex: number) => {
              const rowId = getIdHelper(row.object);
              const selectedId = selectedItem ? getIdHelper(selectedItem.object) : null;
              const isSelected = selectedId === rowId;
              const isOdd = rowIndex % 2 === 1;
              return (
              <tr 
                key={rowId} 
                onClick={() => onSelectItem?.(isSelected ? null : row)}
                className={`transition-colors cursor-pointer ${
                  isSelected 
                    ? 'bg-blue-500/20 dark:bg-blue-500/20' 
                    : isOdd 
                      ? 'bg-neutral-200/40 dark:bg-neutral-800/30 hover:bg-neutral-200/70 dark:hover:bg-neutral-800/50'
                      : 'hover:bg-neutral-200/50 dark:hover:bg-neutral-800/30'
                }`}
              >
                {visibleColumns.map((col, idx) => {
                  // Handle the synthetic Namespace column
                  const isNamespaceColumn = col.name === 'Namespace' && showNamespaceColumn;
                  const cellIndex = isNamespaceColumn 
                    ? -1 
                    : data!.columnDefinitions.findIndex((c) => c.name === col.name);
                  const cellValue = isNamespaceColumn 
                    ? getNamespaceHelper(row.object) 
                    : row.cells[cellIndex];
                  const formatted = formatCell(cellValue, col);
                  const isNameColumn = col.name.toLowerCase() === 'name';

                  if (isStatusColumn(col)) {
                    return (
                      <td key={idx} className={`px-4 py-2 whitespace-nowrap ${idx === 0 ? 'rounded-l-lg' : ''} ${idx === visibleColumns.length - 1 ? 'rounded-r-lg' : ''}`}>
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium capitalize ${
                          formatted.toLowerCase().match(/running|active|ready|available|bound|succeeded|complete|healthy|true/) ? 'text-emerald-600 dark:text-emerald-400' :
                          formatted.toLowerCase().match(/pending|creating|waiting|progressing|scheduled/) ? 'text-amber-600 dark:text-amber-400' :
                          formatted.toLowerCase().match(/failed|error|crashloopbackoff|terminated|unknown|lost|false/) ? 'text-red-600 dark:text-red-400' :
                          'text-neutral-500 dark:text-neutral-400'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            formatted.toLowerCase().match(/running|active|ready|available|bound|succeeded|complete|healthy|true/) ? 'bg-emerald-500' :
                            formatted.toLowerCase().match(/pending|creating|waiting|progressing|scheduled/) ? 'bg-amber-500' :
                            formatted.toLowerCase().match(/failed|error|crashloopbackoff|terminated|unknown|lost|false/) ? 'bg-red-500' :
                            'bg-neutral-400'
                          }`} />
                          {formatted}
                        </span>
                      </td>
                    );
                  }

                  return (
                    <td key={idx} className={`px-4 py-2 whitespace-nowrap ${idx === 0 ? 'rounded-l-lg' : ''} ${idx === visibleColumns.length - 1 ? 'rounded-r-lg' : ''} ${
                      isNameColumn 
                        ? 'text-neutral-900 dark:text-neutral-300' 
                        : 'text-neutral-500 dark:text-neutral-500'
                    }`}>
                      {formatted}
                    </td>
                  );
                })}
              </tr>
            );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
