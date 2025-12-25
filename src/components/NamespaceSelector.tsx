import { useState, useMemo, useRef, useEffect } from 'react';
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
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

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

  // Flatten options for keyboard navigation
  const flatOptions = useMemo(() => {
    const options: { value: string; label: string }[] = [];
    const showAllNamespacesOption = query === '' || 'all namespaces'.includes(query.toLowerCase());
    
    if (showAllNamespacesOption) {
      options.push({ value: '', label: 'All Namespaces' });
    }
    
    for (const group of filteredGroups) {
      for (const ns of group.namespaces) {
        options.push({ value: ns.name, label: ns.name });
      }
    }
    
    return options;
  }, [filteredGroups, query]);

  const hasResults = filteredGroups.some(g => g.namespaces.length > 0);
  const showAllNamespacesOption = query === '' || 'all namespaces'.includes(query.toLowerCase());

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setQuery('');
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Focus input when opening
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      setFocusedIndex(-1);
    }
  }, [isOpen]);

  const handleSelect = (value: string) => {
    onSelectNamespace(value || undefined);
    setIsOpen(false);
    setQuery('');
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setFocusedIndex(prev => Math.min(prev + 1, flatOptions.length - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setFocusedIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        event.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < flatOptions.length) {
          handleSelect(flatOptions[focusedIndex].value);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setQuery('');
        break;
    }
  };

  // Scroll focused item into view
  useEffect(() => {
    if (focusedIndex >= 0 && listRef.current) {
      const focusedElement = listRef.current.querySelector(`[data-index="${focusedIndex}"]`);
      focusedElement?.scrollIntoView({ block: 'nearest' });
    }
  }, [focusedIndex]);

  let optionIndex = -1;

  return (
    <div className="relative" ref={containerRef}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          className="w-full px-3 py-1.5 pr-8 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 rounded-lg text-[13px] text-left disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-1 focus:ring-neutral-400/50 dark:focus:ring-neutral-500/50 cursor-default placeholder:text-neutral-400"
          value={isOpen ? query : (selectedNamespace || 'All Namespaces')}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => !disabled && setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={isOpen ? "Search..." : undefined}
          disabled={disabled}
          readOnly={!isOpen}
        />
        <button
          type="button"
          onClick={() => !disabled && setIsOpen(!isOpen)}
          className="absolute inset-y-0 right-0 flex items-center pr-2"
          disabled={disabled}
        >
          <ChevronDown size={14} className="text-neutral-400 dark:text-neutral-500" />
        </button>
      </div>

      {isOpen && (
        <div
          ref={listRef}
          className="absolute z-50 w-full mt-1 bg-white dark:bg-neutral-950 rounded-lg shadow-xl max-h-96 overflow-y-auto focus:outline-none border border-neutral-200 dark:border-neutral-700"
        >
          {!hasResults && !showAllNamespacesOption ? (
            <div className="px-3 py-3 text-sm text-neutral-500 dark:text-neutral-400">
              No namespaces found
            </div>
          ) : (
            <>
              {showAllNamespacesOption && (
                <div
                  data-index={++optionIndex}
                  onClick={() => handleSelect('')}
                  className={`px-3 py-2 cursor-pointer text-[13px] flex items-center justify-between ${
                    focusedIndex === optionIndex
                      ? 'bg-neutral-100 dark:bg-neutral-700'
                      : ''
                  } ${
                    selectedNamespace === undefined
                      ? 'text-neutral-900 dark:text-neutral-100'
                      : 'text-neutral-600 dark:text-neutral-400'
                  }`}
                >
                  <span className="truncate">All Namespaces</span>
                  {selectedNamespace === undefined && (
                    <Check size={14} className="text-neutral-500 dark:text-neutral-400" />
                  )}
                </div>
              )}
              {filteredGroups.map((group) => (
                <div key={group.label} className="py-1">
                  <div className="px-3 py-1 text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
                    {group.label}
                  </div>
                  {group.namespaces.map((ns) => {
                    const currentIndex = ++optionIndex;
                    const isSelected = selectedNamespace === ns.name;
                    const isFocused = focusedIndex === currentIndex;
                    
                    return (
                      <div
                        key={ns.name}
                        data-index={currentIndex}
                        onClick={() => handleSelect(ns.name)}
                        className={`mx-1 px-2.5 py-1.5 rounded-md cursor-pointer text-[13px] flex items-center justify-between ${
                          isFocused ? 'bg-neutral-100 dark:bg-neutral-700' : ''
                        } ${
                          isSelected
                            ? 'text-neutral-900 dark:text-neutral-100'
                            : 'text-neutral-600 dark:text-neutral-400'
                        }`}
                      >
                        <span className="truncate">{ns.name}</span>
                        {isSelected && (
                          <Check size={14} className="text-neutral-500 dark:text-neutral-400" />
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
