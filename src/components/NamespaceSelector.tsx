import { Listbox, ListboxButton, ListboxOptions, ListboxOption } from '@headlessui/react';
import { ChevronDown, Check } from 'lucide-react';

interface NamespaceSelectorProps {
  namespaces: string[];
  selectedNamespace: string | undefined;
  onSelectNamespace: (namespace: string | undefined) => void;
  disabled?: boolean;
}

export function NamespaceSelector({ 
  namespaces, 
  selectedNamespace, 
  onSelectNamespace,
  disabled = false 
}: NamespaceSelectorProps) {
  const displayValue = selectedNamespace || 'All Namespaces';

  return (
    <>
      <Listbox 
        value={selectedNamespace ?? ''} 
        onChange={(value) => onSelectNamespace(value || undefined)}
        disabled={disabled}
      >
        <div className="relative">
          <ListboxButton 
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-gray-100 text-sm text-left cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-gray-600 flex items-center justify-between"
          >
            <span className="truncate">{displayValue}</span>
            <ChevronDown size={16} className="text-gray-500 shrink-0" />
          </ListboxButton>

          <ListboxOptions
            anchor="bottom start"
            className="z-50 w-(--button-width) mt-1 bg-gray-900 border border-gray-700 rounded-lg shadow-xl max-h-60 overflow-y-auto focus:outline-none [--anchor-gap:4px]"
          >
            <ListboxOption
              value=""
              className="px-3 py-2 cursor-pointer text-sm text-gray-300 data-focus:bg-gray-800 data-selected:text-gray-100 flex items-center justify-between"
            >
              {({ selected }) => (
                <>
                  <span>All Namespaces</span>
                  {selected && <Check size={16} className="text-gray-400" />}
                </>
              )}
            </ListboxOption>
            {namespaces.map((ns) => (
              <ListboxOption
                key={ns}
                value={ns}
                className="px-3 py-2 cursor-pointer text-sm text-gray-300 data-focus:bg-gray-800 data-selected:text-gray-100 flex items-center justify-between"
              >
                {({ selected }) => (
                  <>
                    <span className="truncate">{ns}</span>
                    {selected && <Check size={16} className="text-gray-400" />}
                  </>
                )}
              </ListboxOption>
            ))}
          </ListboxOptions>
        </div>
      </Listbox>
    </>
  );
}
