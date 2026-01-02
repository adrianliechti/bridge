import { useState, useRef, useEffect } from 'react';
import { Columns3, Check } from 'lucide-react';
import type { Column } from '@tanstack/react-table';

interface ColumnFilterProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: Column<any, unknown>[];
}

export function ColumnFilter({ columns }: ColumnFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Close on escape
  useEffect(() => {
    if (!isOpen) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  if (columns.length === 0) return null;

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 dark:text-neutral-500 dark:hover:text-neutral-300 dark:hover:bg-neutral-800 rounded-md transition-colors focus:outline-none"
        title="Toggle columns"
      >
        <Columns3 size={18} />
      </button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-1 p-2 bg-white border border-neutral-300 dark:bg-neutral-900 dark:border-neutral-700 rounded-lg shadow-xl min-w-45 max-h-75 overflow-y-auto">
          {columns.map((column) => {
            const isVisible = column.getIsVisible();
            const columnId = column.id;
            // Use the header text if available, otherwise fall back to the column ID
            const headerDef = column.columnDef.header;
            const displayName = typeof headerDef === 'string' ? headerDef : columnId;
            return (
              <label
                key={columnId}
                className="flex items-center gap-2 px-2 py-1.5 cursor-pointer rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <span
                  onClick={column.getToggleVisibilityHandler()}
                  className={`size-4 rounded border flex items-center justify-center cursor-pointer transition-colors ${
                    isVisible
                      ? 'bg-neutral-500 border-neutral-500 dark:bg-neutral-600 dark:border-neutral-500'
                      : 'border-neutral-300 bg-white dark:border-neutral-600 dark:bg-neutral-800'
                  }`}
                >
                  {isVisible && <Check size={12} className="text-white dark:text-neutral-300" />}
                </span>
                <span 
                  onClick={column.getToggleVisibilityHandler()}
                  className="text-sm text-neutral-700 dark:text-neutral-400 cursor-pointer"
                >
                  {displayName}
                </span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
