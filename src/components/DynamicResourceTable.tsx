import { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useKubernetesQuery } from '../hooks/useKubernetesQuery';
import { getResourceTable, type V1APIResource } from '../api/kubernetesTable';
import type { TableColumnDefinition, TableRow } from '../types/table';

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
  return 'bg-gray-700 text-gray-400';
}

// Check if column likely contains status information
function isStatusColumn(column: TableColumnDefinition): boolean {
  const name = column.name.toLowerCase();
  return name === 'status' || name === 'phase' || name === 'ready' || name === 'condition';
}

interface DynamicResourceTableProps {
  config: V1APIResource;
  namespace?: string;
  hiddenColumns: Set<string>;
  onColumnsLoaded?: (columns: TableColumnDefinition[]) => void;
  selectedItem?: TableRow | null;
  onSelectItem?: (item: TableRow | null) => void;
}

export function DynamicResourceTable({ 
  config, 
  namespace, 
  hiddenColumns,
  onColumnsLoaded,
  selectedItem,
  onSelectItem
}: DynamicResourceTableProps) {
  const { data, loading, error, refetch } = useKubernetesQuery(
    () => getResourceTable(config, namespace),
    [config, namespace]
  );

  // Get visible columns
  const visibleColumns = useMemo(() => {
    if (!data) return [];
    return data.columnDefinitions.filter((col) => !hiddenColumns.has(col.name.toLowerCase()));
  }, [data, hiddenColumns]);

  // Notify parent of columns when data loads
  useMemo(() => {
    if (data && onColumnsLoaded) {
      onColumnsLoaded(data.columnDefinitions);
    }
  }, [data, onColumnsLoaded]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-4">
        <div className="w-8 h-8 border-3 border-gray-700 border-t-gray-400 rounded-full animate-spin" />
        <span>Loading {config.name}...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center gap-3 py-12 px-6 bg-red-500/10 rounded-lg text-red-400">
        <AlertTriangle size={20} />
        <span>Error: {error.message}</span>
        <button 
          onClick={refetch} 
          className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-md text-gray-100 text-sm hover:bg-gray-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data || data.rows.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-500 bg-gray-900 rounded-lg border border-dashed border-gray-700">
        <span>No {config.name} found</span>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-800">
          <tr>
            {visibleColumns.map((col, idx) => (
              <th 
                key={idx} 
                title={col.description}
                className="text-left px-4 py-2 text-gray-500 text-[11px] font-medium uppercase tracking-wider whitespace-nowrap"
              >
                {col.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row: TableRow) => {
            const isSelected = selectedItem?.object.metadata.uid === row.object.metadata.uid;
            return (
            <tr 
              key={row.object.metadata.uid} 
              onClick={() => onSelectItem?.(isSelected ? null : row)}
              className={`hover:bg-gray-800/50 transition-colors cursor-pointer ${
                isSelected ? 'bg-sky-500/10 hover:bg-sky-500/15' : ''
              }`}
            >
              {visibleColumns.map((col, idx) => {
                const cellIndex = data.columnDefinitions.findIndex(
                  (c) => c.name === col.name
                );
                const cellValue = row.cells[cellIndex];
                const formatted = formatCell(cellValue, col);

                if (isStatusColumn(col)) {
                  return (
                    <td key={idx} className="px-4 py-3 border-t border-gray-800 whitespace-nowrap">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${getStatusClasses(formatted)}`}>
                        {formatted}
                      </span>
                    </td>
                  );
                }

                return (
                  <td key={idx} className="px-4 py-3 border-t border-gray-800 text-gray-100 whitespace-nowrap">
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
  );
}
