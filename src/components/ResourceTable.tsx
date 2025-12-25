import { useMemo, useEffect, useState } from 'react';
import { AlertTriangle, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { useKubernetesQuery } from '../hooks/useKubernetesQuery';
import { getResourceTable, type V1APIResource } from '../api/kubernetesTable';
import type { TableColumnDefinition, TableRow } from '../types/table';

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

// Get status badge classes based on cell content
function getStatusClasses(value: string): string {
  const lower = value.toLowerCase();
  if (['running', 'active', 'ready', 'available', 'bound', 'succeeded', 'complete', 'healthy', 'true'].includes(lower)) {
    return 'bg-emerald-500/20 text-emerald-400';
  }
  if (['pending', 'creating', 'waiting', 'progressing', 'scheduled'].includes(lower)) {
    return 'bg-amber-500/20 text-amber-400';
  }
  if (['failed', 'error', 'crashloopbackoff', 'terminated', 'unknown', 'lost', 'false'].includes(lower)) {
    return 'bg-red-500/20 text-red-400';
  }
  if (['terminating', 'released'].includes(lower)) {
    return 'bg-cyan-500/20 text-cyan-400';
  }
  return 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-400';
}

// Check if column likely contains status information
function isStatusColumn(column: TableColumnDefinition): boolean {
  const name = column.name.toLowerCase();
  return name === 'status' || name === 'phase' || name === 'ready' || name === 'condition';
}

interface ResourceTableProps {
  config: V1APIResource;
  namespace?: string;
  hiddenColumns: Set<string>;
  onColumnsLoaded?: (columns: TableColumnDefinition[]) => void;
  selectedItem?: TableRow | null;
  onSelectItem?: (item: TableRow | null) => void;
}

export function ResourceTable({ 
  config, 
  namespace, 
  hiddenColumns,
  onColumnsLoaded,
  selectedItem,
  onSelectItem
}: ResourceTableProps) {
  const [sortState, setSortState] = useState<SortState>({ column: null, direction: null });
  
  const { data, loading, error, refetch } = useKubernetesQuery(
    () => getResourceTable(config, namespace),
    [config, namespace]
  );

  // Get visible columns
  const visibleColumns = useMemo(() => {
    if (!data?.columnDefinitions) return [];
    return data.columnDefinitions.filter((col) => !hiddenColumns.has(col.name.toLowerCase()));
  }, [data, hiddenColumns]);

  // Sort rows
  const sortedRows = useMemo(() => {
    if (!data?.rows || !sortState.column || !sortState.direction) {
      return data?.rows ?? [];
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
  }, [data, sortState]);

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
      <div className="m-5">
        <div className="bg-white dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700/50 shadow-sm overflow-hidden">
          <div className="flex flex-col items-center justify-center py-16 text-gray-600 dark:text-gray-400 gap-4">
            <div className="w-10 h-10 border-3 border-gray-200 border-t-blue-500 dark:border-gray-700 dark:border-t-blue-400 rounded-full animate-spin" />
            <span className="text-sm">Loading {config.name}...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="m-5">
        <div className="bg-white dark:bg-gray-800/50 rounded-xl border border-red-200 dark:border-red-500/30 shadow-sm overflow-hidden">
          <div className="flex items-center justify-center gap-3 py-12 px-6 text-red-600 dark:text-red-400">
            <AlertTriangle size={20} />
            <span>Error: {error.message}</span>
            <button 
              onClick={refetch} 
              className="px-4 py-2 bg-red-50 border border-red-200 text-red-700 dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-400 rounded-lg text-sm hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!data || !data.columnDefinitions || data.rows.length === 0) {
    return (
      <div className="m-5">
        <div className="bg-white dark:bg-gray-800/50 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 shadow-sm overflow-hidden">
          <div className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400">
            <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700/50 flex items-center justify-center mb-3">
              <svg className="w-6 h-6 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
            </div>
            <span className="text-sm">No {config.name} found</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-5 h-full">
      <div className="bg-white dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700/50 shadow-sm overflow-auto h-full">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700/50 sticky top-0 z-10">
            <tr>
              {visibleColumns.map((col, idx) => {
                const isSorted = sortState.column === col.name;
                return (
                  <th 
                    key={idx} 
                    title={col.description}
                    onClick={() => handleSort(col.name)}
                    className={`text-left px-5 py-4 text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap cursor-pointer transition-colors select-none group ${
                      isSorted 
                        ? 'text-blue-600 dark:text-blue-400' 
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      {col.name}
                      <span className={`transition-opacity ${isSorted ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'}`}>
                        {isSorted && sortState.direction === 'asc' ? (
                          <ChevronUp size={14} />
                        ) : isSorted && sortState.direction === 'desc' ? (
                          <ChevronDown size={14} />
                        ) : (
                          <ChevronsUpDown size={14} />
                        )}
                      </span>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
            {sortedRows.map((row: TableRow) => {
              const isSelected = selectedItem?.object.metadata.uid === row.object.metadata.uid;
              return (
              <tr 
                key={row.object.metadata.uid} 
                onClick={() => onSelectItem?.(isSelected ? null : row)}
                className={`transition-all cursor-pointer ${
                  isSelected 
                    ? 'bg-blue-50/80 hover:bg-blue-100/80 dark:bg-blue-500/10 dark:hover:bg-blue-500/15 ring-1 ring-inset ring-blue-200 dark:ring-blue-500/30' 
                    : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'
                }`}
              >
                {visibleColumns.map((col, idx) => {
                  const cellIndex = data!.columnDefinitions.findIndex(
                    (c) => c.name === col.name
                  );
                  const cellValue = row.cells[cellIndex];
                  const formatted = formatCell(cellValue, col);
                  const isNameColumn = col.name.toLowerCase() === 'name';

                  if (isStatusColumn(col)) {
                    return (
                      <td key={idx} className="px-5 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium capitalize ${getStatusClasses(formatted)}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            formatted.toLowerCase().match(/running|active|ready|available|bound|succeeded|complete|healthy|true/) ? 'bg-emerald-400' :
                            formatted.toLowerCase().match(/pending|creating|waiting|progressing|scheduled/) ? 'bg-amber-400' :
                            formatted.toLowerCase().match(/failed|error|crashloopbackoff|terminated|unknown|lost|false/) ? 'bg-red-400' :
                            'bg-gray-400'
                          }`} />
                          {formatted}
                        </span>
                      </td>
                    );
                  }

                  return (
                    <td key={idx} className={`px-5 py-4 whitespace-nowrap ${
                      isNameColumn 
                        ? 'text-gray-900 dark:text-gray-100 font-medium' 
                        : 'text-gray-500 dark:text-gray-400'
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
