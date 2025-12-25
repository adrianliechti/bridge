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
        className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-500 dark:hover:text-gray-300 dark:hover:bg-gray-800 rounded-md transition-colors focus:outline-none"
        title="Toggle columns"
      >
        <Columns3 size={18} />
      </button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-1 p-2 bg-white border border-gray-300 dark:bg-gray-900 dark:border-gray-700 rounded-lg shadow-xl min-w-45 max-h-75 overflow-y-auto">
          {columns.map((col) => {
            const isVisible = !hiddenColumns.has(col.name.toLowerCase());
            return (
              <label
                key={col.name}
                className="flex items-center gap-2 px-2 py-1.5 cursor-pointer rounded hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <span
                  onClick={() => onToggleColumn(col.name)}
                  className={`size-4 rounded border flex items-center justify-center cursor-pointer transition-colors ${
                    isVisible
                      ? 'bg-gray-500 border-gray-500 dark:bg-gray-600 dark:border-gray-500'
                      : 'border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800'
                  }`}
                >
                  {isVisible && <Check size={12} className="text-white dark:text-gray-300" />}
                </span>
                <span 
                  onClick={() => onToggleColumn(col.name)}
                  className="text-sm text-gray-700 dark:text-gray-400 cursor-pointer"
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
