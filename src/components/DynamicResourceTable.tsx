import { useState, useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useKubernetesQuery } from '../hooks/useKubernetesQuery';
import { getResourceTable, type ResourceConfig } from '../api/kubernetesTable';
import type { TableColumnDefinition, TableRow } from '../types/table';

interface DynamicResourceTableProps {
  config: ResourceConfig;
  namespace?: string;
}

// Columns that are hidden by default (can be shown via column filter)
const DEFAULT_HIDDEN_COLUMNS = new Set([
  'selector',
  'containers',
  'images',
  'labels',
  'annotations',
]);

// Format cell value based on column type
function formatCell(value: unknown, column: TableColumnDefinition): string {
  if (value === null || value === undefined) {
    return '<none>';
  }

  // Handle different formats
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

// Get status badge variant based on cell content
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

export function DynamicResourceTable({ config, namespace }: DynamicResourceTableProps) {
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(() => new Set(DEFAULT_HIDDEN_COLUMNS));
  const [showColumnFilter, setShowColumnFilter] = useState(false);
  
  const { data, loading, error, refetch } = useKubernetesQuery(
    () => getResourceTable(config, namespace),
    [config, namespace]
  );

  // Get all available columns and filter visible ones
  const { allColumns, visibleColumns } = useMemo(() => {
    if (!data) return { allColumns: [], visibleColumns: [] };
    const all = data.columnDefinitions;
    const visible = all.filter((col) => !hiddenColumns.has(col.name.toLowerCase()));
    return { allColumns: all, visibleColumns: visible };
  }, [data, hiddenColumns]);

  const toggleColumn = (columnName: string) => {
    const key = columnName.toLowerCase();
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-4">
        <div className="w-8 h-8 border-3 border-gray-700 border-t-gray-400 rounded-full animate-spin" />
        <span>Loading {config.plural}...</span>
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
        <span>No {config.plural} found</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex justify-between items-center">
        <span className="text-sm text-gray-500">{data.rows.length} items</span>
        <div className="relative">
          <button 
            className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-md text-gray-400 text-sm hover:bg-gray-700 hover:border-gray-600 transition-colors"
            onClick={() => setShowColumnFilter(!showColumnFilter)}
          >
            Columns ({visibleColumns.length}/{allColumns.length})
          </button>
          {showColumnFilter && (
            <div className="absolute top-full right-0 mt-1 p-2 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 min-w-45 max-h-75 overflow-y-auto">
              {allColumns.map((col) => (
                <label 
                  key={col.name} 
                  className="flex items-center gap-2 px-2 py-1.5 cursor-pointer rounded hover:bg-gray-800 text-sm text-gray-400"
                >
                  <input
                    type="checkbox"
                    checked={!hiddenColumns.has(col.name.toLowerCase())}
                    onChange={() => toggleColumn(col.name)}
                    className="w-3.5 h-3.5 accent-gray-500"
                  />
                  <span>{col.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr>
              {visibleColumns.map((col, idx) => (
                <th 
                  key={idx} 
                  title={col.description}
                  className="text-left px-4 py-3 bg-gray-800 text-gray-500 text-xs font-semibold uppercase tracking-wide whitespace-nowrap"
                >
                  {col.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row: TableRow) => (
              <tr key={row.object.metadata.uid} className="hover:bg-gray-800/50 transition-colors">
                {visibleColumns.map((col, idx) => {
                  const cellIndex = data.columnDefinitions.findIndex(
                    (c) => c.name === col.name
                  );
                  const cellValue = row.cells[cellIndex];
                  const formatted = formatCell(cellValue, col);

                  // Render status columns with badges
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
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
