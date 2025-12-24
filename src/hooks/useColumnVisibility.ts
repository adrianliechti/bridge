import { useState, useCallback, useEffect } from 'react';

// Columns that are hidden by default
const DEFAULT_HIDDEN_COLUMNS = new Set([
  'selector',
  'containers',
  'images',
  'labels',
  'annotations',
]);

// Hook for managing column visibility
export function useColumnVisibility(resetKey?: string) {
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(() => new Set(DEFAULT_HIDDEN_COLUMNS));

  // Reset to defaults when resetKey changes
  useEffect(() => {
    setHiddenColumns(new Set(DEFAULT_HIDDEN_COLUMNS));
  }, [resetKey]);

  const toggleColumn = useCallback((columnName: string) => {
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
  }, []);

  return { hiddenColumns, toggleColumn };
}
