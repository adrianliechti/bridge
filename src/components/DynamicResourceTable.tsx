import { useState, useMemo } from 'react';
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
function getStatusVariant(value: string): 'success' | 'warning' | 'error' | 'info' | 'default' {
  const lower = value.toLowerCase();
  if (['running', 'active', 'ready', 'available', 'bound', 'succeeded', 'complete', 'healthy', 'true'].includes(lower)) {
    return 'success';
  }
  if (['pending', 'creating', 'waiting', 'progressing', 'scheduled'].includes(lower)) {
    return 'warning';
  }
  if (['failed', 'error', 'crashloopbackoff', 'terminated', 'unknown', 'lost', 'false'].includes(lower)) {
    return 'error';
  }
  if (['terminating', 'released'].includes(lower)) {
    return 'info';
  }
  return 'default';
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
      <div className="loading">
        <div className="spinner"></div>
        <span>Loading {config.plural}...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error">
        <span className="error-icon">⚠️</span>
        <span>Error: {error.message}</span>
        <button onClick={refetch} className="retry-btn">Retry</button>
      </div>
    );
  }

  if (!data || data.rows.length === 0) {
    return (
      <div className="empty">
        <span>No {config.plural} found</span>
      </div>
    );
  }

  return (
    <div className="table-wrapper">
      <div className="table-toolbar">
        <span className="row-count">{data.rows.length} items</span>
        <div className="column-filter-wrapper">
          <button 
            className="column-filter-btn"
            onClick={() => setShowColumnFilter(!showColumnFilter)}
          >
            Columns ({visibleColumns.length}/{allColumns.length})
          </button>
          {showColumnFilter && (
            <div className="column-filter-dropdown">
              {allColumns.map((col) => (
                <label key={col.name} className="column-filter-item">
                  <input
                    type="checkbox"
                    checked={!hiddenColumns.has(col.name.toLowerCase())}
                    onChange={() => toggleColumn(col.name)}
                  />
                  <span>{col.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="table-container">
        <table className="resource-table">
          <thead>
            <tr>
              {visibleColumns.map((col, idx) => (
                <th key={idx} title={col.description}>
                  {col.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row: TableRow) => (
              <tr key={row.object.metadata.uid}>
                {visibleColumns.map((col, idx) => {
                  const cellIndex = data.columnDefinitions.findIndex(
                    (c) => c.name === col.name
                  );
                  const cellValue = row.cells[cellIndex];
                  const formatted = formatCell(cellValue, col);

                  // Render status columns with badges
                  if (isStatusColumn(col)) {
                    return (
                      <td key={idx}>
                        <span className={`status-badge status-${getStatusVariant(formatted)}`}>
                          {formatted}
                        </span>
                      </td>
                    );
                  }

                  return <td key={idx}>{formatted}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
