import { useState, useCallback } from 'react';
import type { VisibilityState, OnChangeFn } from '@tanstack/react-table';

// Columns that are hidden by default
const DEFAULT_HIDDEN_COLUMNS: VisibilityState = {
  selector: false,
  containers: false,
  images: false,
  labels: false,
  annotations: false,
  'nominated node': false,
  'readiness gates': false,
  'node selector': false,
};

// Hook for managing column visibility with TanStack Table
// To reset state when resource changes, use key prop on the component using this hook
export function useColumnVisibility() {
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() => ({ ...DEFAULT_HIDDEN_COLUMNS }));

  const onColumnVisibilityChange: OnChangeFn<VisibilityState> = useCallback((updater) => {
    setColumnVisibility((prev) => (typeof updater === 'function' ? updater(prev) : updater));
  }, []);

  return { columnVisibility, onColumnVisibilityChange };
}
