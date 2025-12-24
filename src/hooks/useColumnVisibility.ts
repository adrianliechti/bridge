import { useState, useCallback } from 'react';

// Columns that are hidden by default
const DEFAULT_HIDDEN_COLUMNS = [
  'selector',
  'containers',
  'images',
  'labels',
  'annotations',
  'nominated node',
  'readiness gates',
  'node selector',
];

// Hook for managing column visibility
// To reset state when resource changes, use key prop on the component using this hook
export function useColumnVisibility() {
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(() => new Set(DEFAULT_HIDDEN_COLUMNS));

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
