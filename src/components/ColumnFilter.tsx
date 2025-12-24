import { Popover, PopoverButton, PopoverPanel, Checkbox, Field, Label } from '@headlessui/react';
import { Columns3 } from 'lucide-react';
import type { TableColumnDefinition } from '../types/table';

interface ColumnFilterProps {
  columns: TableColumnDefinition[];
  hiddenColumns: Set<string>;
  onToggleColumn: (columnName: string) => void;
}

export function ColumnFilter({ columns, hiddenColumns, onToggleColumn }: ColumnFilterProps) {
  if (columns.length === 0) return null;

  return (
    <Popover className="relative">
      <PopoverButton 
        className="p-2 text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded-md transition-colors focus:outline-none"
        title="Toggle columns"
      >
        <Columns3 size={18} />
      </PopoverButton>

      <PopoverPanel
        anchor="bottom end"
        className="z-50 mt-1 p-2 bg-gray-900 border border-gray-700 rounded-lg shadow-xl min-w-45 max-h-75 overflow-y-auto [--anchor-gap:4px]"
      >
        {columns.map((col) => (
          <Field key={col.name} className="flex items-center gap-2 px-2 py-1.5 cursor-pointer rounded hover:bg-gray-800">
            <Checkbox
              checked={!hiddenColumns.has(col.name.toLowerCase())}
              onChange={() => onToggleColumn(col.name)}
              className="group size-4 rounded border border-gray-600 bg-gray-800 data-checked:bg-gray-600 data-checked:border-gray-500 flex items-center justify-center"
            >
              <svg className="hidden size-3 text-gray-300 group-data-checked:block" viewBox="0 0 14 14" fill="none">
                <path d="M3 8L6 11L11 3.5" strokeWidth={2} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Checkbox>
            <Label className="text-sm text-gray-400 cursor-pointer">{col.name}</Label>
          </Field>
        ))}
      </PopoverPanel>
    </Popover>
  );
}
