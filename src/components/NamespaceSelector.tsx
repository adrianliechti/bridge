import { useState, useMemo } from 'react';
import { Combobox, ComboboxInput, ComboboxButton, ComboboxOptions, ComboboxOption } from '@headlessui/react';
import { ChevronDown, Check } from 'lucide-react';

export interface Namespace {
  name: string;
  labels?: Record<string, string>;
}

interface NamespaceGroup {
  label: string;
  namespaces: Namespace[];
}

interface NamespaceSelectorProps {
  namespaces: Namespace[];
  selectedNamespace: string | undefined;
  onSelectNamespace: (namespace: string | undefined) => void;
  disabled?: boolean;
  /** Ordered list of label keys to group by (e.g., ['project', 'spaces']) */
  spaceLabels?: string[];
  /** List of platform namespace names */
  platformNamespaces?: string[];
}

export function NamespaceSelector({ 
  namespaces, 
  selectedNamespace, 
  onSelectNamespace,
  disabled = false,
  spaceLabels = [],
  platformNamespaces = [],
}: NamespaceSelectorProps) {
  const [query, setQuery] = useState('');

  // Create sets for quick lookup
  const platformNsSet = useMemo(() => new Set(platformNamespaces), [platformNamespaces]);

  // Group namespaces
  const groups = useMemo(() => {
    const result: NamespaceGroup[] = [];
    const assigned = new Set<string>();

    // Group by labels in order
    for (const labelKey of spaceLabels) {
      const grouped = new Map<string, Namespace[]>();
      
      for (const ns of namespaces) {
        if (assigned.has(ns.name)) continue;
        const labelValue = ns.labels?.[labelKey];
        if (labelValue) {
          if (!grouped.has(labelValue)) {
            grouped.set(labelValue, []);
          }
          grouped.get(labelValue)!.push(ns);
          assigned.add(ns.name);
        }
      }

      // Add groups sorted by label value
      for (const [value, nsList] of Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b))) {
        result.push({
          label: value,
          namespaces: nsList.sort((a, b) => a.name.localeCompare(b.name)),
        });
      }
    }

    // User namespaces (fallback - before platform)
    const userNs = namespaces
      .filter(ns => !assigned.has(ns.name) && !platformNsSet.has(ns.name))
      .sort((a, b) => a.name.localeCompare(b.name));
    
    if (userNs.length > 0) {
      result.push({ label: 'User', namespaces: userNs });
    }

    // Platform namespaces (last)
    const platformNs = namespaces
      .filter(ns => !assigned.has(ns.name) && platformNsSet.has(ns.name))
      .sort((a, b) => a.name.localeCompare(b.name));
    
    if (platformNs.length > 0) {
      result.push({ label: 'Platform', namespaces: platformNs });
    }

    return result;
  }, [namespaces, spaceLabels, platformNsSet]);

  // Filter namespaces based on query
  const filteredGroups = useMemo(() => {
    if (query === '') return groups;
    
    return groups
      .map(group => ({
        ...group,
        namespaces: group.namespaces.filter(ns => 
          ns.name.toLowerCase().includes(query.toLowerCase())
        ),
      }))
      .filter(group => group.namespaces.length > 0);
  }, [groups, query]);

  const hasResults = filteredGroups.some(g => g.namespaces.length > 0);
  const showAllNamespacesOption = query === '' || 'all namespaces'.includes(query.toLowerCase());

  return (
    <Combobox 
      value={selectedNamespace ?? ''} 
      onChange={(value) => onSelectNamespace(value || undefined)}
      onClose={() => setQuery('')}
      disabled={disabled}
      immediate
    >
      {({ open }) => (
        <div className="relative">
          <ComboboxInput
            className="w-full px-3 py-2 pr-8 bg-gray-50 border border-gray-300 text-gray-900 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 rounded-md text-sm text-left disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600 cursor-default"
            displayValue={(value: string) => open ? query : (value || 'All Namespaces')}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={open ? "Type to search..." : undefined}
          />
          <ComboboxButton className="absolute inset-y-0 right-0 flex items-center pr-2">
            <ChevronDown size={16} className="text-gray-500 dark:text-gray-500" />
          </ComboboxButton>

          <ComboboxOptions
            anchor="bottom start"
            className="z-50 w-(--input-width) mt-1 bg-white border border-gray-300 dark:bg-gray-900 dark:border-gray-700 rounded-lg shadow-xl max-h-60 overflow-y-auto focus:outline-none [--anchor-gap:4px]"
          >
            {!hasResults && !showAllNamespacesOption ? (
              <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                No namespaces found
              </div>
            ) : (
              <>
                {showAllNamespacesOption && (
                  <ComboboxOption
                    value=""
                    className="px-3 py-2 cursor-pointer text-sm text-gray-700 data-focus:bg-gray-100 data-selected:text-gray-900 dark:text-gray-300 dark:data-focus:bg-gray-800 dark:data-selected:text-gray-100 flex items-center justify-between"
                  >
                    {({ selected }) => (
                      <>
                        <span className="truncate">All Namespaces</span>
                        {selected && <Check size={16} className="text-gray-600 dark:text-gray-400" />}
                      </>
                    )}
                  </ComboboxOption>
                )}
                {filteredGroups.map((group) => (
                  <div key={group.label} className="py-1">
                    <div className="px-3 py-1 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                      {group.label}
                    </div>
                    {group.namespaces.map((ns) => (
                      <ComboboxOption
                        key={ns.name}
                        value={ns.name}
                        className="ml-2 mr-1 px-3 py-1.5 rounded cursor-pointer text-sm text-gray-700 data-focus:bg-gray-100 data-selected:text-gray-900 dark:text-gray-300 dark:data-focus:bg-gray-800 dark:data-selected:text-gray-100 flex items-center justify-between"
                      >
                        {({ selected }) => (
                          <>
                            <span className="truncate">{ns.name}</span>
                            {selected && <Check size={16} className="text-gray-600 dark:text-gray-400" />}
                          </>
                        )}
                      </ComboboxOption>
                    ))}
                  </div>
                ))}
              </>
            )}
          </ComboboxOptions>
        </div>
      )}
    </Combobox>
  );
}
