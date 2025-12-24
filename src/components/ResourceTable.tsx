import React from 'react';

interface Column<T> {
  header: string;
  accessor: (item: T) => React.ReactNode;
  className?: string;
}

interface ResourceTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  loading?: boolean;
  error?: Error | null;
  emptyMessage?: string;
}

export function ResourceTable<T>({
  columns,
  data,
  keyExtractor,
  loading,
  error,
  emptyMessage = 'No resources found',
}: ResourceTableProps<T>) {
  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        <span>Loading resources...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error">
        <span className="error-icon">⚠️</span>
        <span>Error: {error.message}</span>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="empty">
        <span>{emptyMessage}</span>
      </div>
    );
  }

  return (
    <div className="table-container">
      <table className="resource-table">
        <thead>
          <tr>
            {columns.map((col, idx) => (
              <th key={idx} className={col.className}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((item) => (
            <tr key={keyExtractor(item)}>
              {columns.map((col, idx) => (
                <td key={idx} className={col.className}>
                  {col.accessor(item)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
