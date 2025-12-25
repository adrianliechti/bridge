import { useState, useRef, useEffect } from 'react';
import { Columns3, Check } from 'lucide-react';
import type { TableColumnDefinition } from '../types/table';

interface ColumnFilterProps {
  columns: TableColumnDefinition[];
  hiddenColumns: Set<string>;
  onToggleColumn: (columnName: string) => void;
}

export function ColumnFilter({ columns, hiddenColumns, onToggleColumn }: ColumnFilterProps) {
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
          {columns.map((col) => {
            const isVisible = !hiddenColumns.has(col.name.toLowerCase());
            return (
              <label
                key={col.name}
                className="flex items-center gap-2 px-2 py-1.5 cursor-pointer rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <span
                  onClick={() => onToggleColumn(col.name)}
                  className={`size-4 rounded border flex items-center justify-center cursor-pointer transition-colors ${
                    isVisible
                      ? 'bg-neutral-500 border-neutral-500 dark:bg-neutral-600 dark:border-neutral-500'
                      : 'border-neutral-300 bg-white dark:border-neutral-600 dark:bg-neutral-800'
                  }`}
                >
                  {isVisible && <Check size={12} className="text-white dark:text-neutral-300" />}
                </span>
                <span 
                  onClick={() => onToggleColumn(col.name)}
                  className="text-sm text-neutral-700 dark:text-neutral-400 cursor-pointer"
                >
                  {col.name}
                </span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
