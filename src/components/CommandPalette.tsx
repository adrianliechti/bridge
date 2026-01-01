import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search } from 'lucide-react';
import type { CommandPaletteAdapter, SearchResult, SearchMode } from '../types/commandPalette';

// Normalize string for fuzzy matching (remove hyphens, underscores, dots)
function normalizeForSearch(str: string): string {
  return str.toLowerCase().replace(/[-_.]/g, '');
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  adapter: CommandPaletteAdapter;
}

export function CommandPalette({ isOpen, onClose, adapter }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [asyncResults, setAsyncResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  
  // Track adapter.id and isOpen in state to detect changes during render
  const [trackedAdapterId, setTrackedAdapterId] = useState(adapter.id);
  const [wasOpen, setWasOpen] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Detect adapter change during render and reset initialization state
  if (adapter.id !== trackedAdapterId) {
    setTrackedAdapterId(adapter.id);
    setIsInitialized(false);
  }

  // Initialize adapter when it changes
  useEffect(() => {
    let cancelled = false;
    setIsInitialized(false);
    adapter.initialize().then(() => {
      if (!cancelled) {
        setIsInitialized(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [adapter]);

  // Detect palette opening during render and reset state
  if (isOpen && !wasOpen) {
    setWasOpen(true);
    setQuery('');
    setFocusedIndex(0);
    setAsyncResults([]);
  } else if (!isOpen && wasOpen) {
    setWasOpen(false);
  }

  // Determine search mode from query prefix
  const { searchMode, searchQuery } = useMemo(() => {
    // Check prefixes in order (longer prefixes first, e.g., @@ before @)
    const sortedPrefixes = [...adapter.searchModePrefixes].sort(
      (a, b) => b.prefix.length - a.prefix.length
    );
    
    for (const { prefix, mode } of sortedPrefixes) {
      if (query.startsWith(prefix)) {
        return { searchMode: mode, searchQuery: query.slice(prefix.length).trim() };
      }
    }
    
    return { searchMode: 'search' as SearchMode, searchQuery: query.trim() };
  }, [query, adapter.searchModePrefixes]);

  // Get available resource types from adapter
  const availableResourceTypes = useMemo(() => {
    if (!isInitialized) return [];
    return adapter.getAvailableResourceTypes();
  }, [adapter, isInitialized]);

  // Filter resource types (synchronous)
  const filteredResourceTypes = useMemo(() => {
    const q = normalizeForSearch(searchQuery);
    return availableResourceTypes.filter(rt => 
      normalizeForSearch(rt.label).includes(q) ||
      normalizeForSearch(rt.kind).includes(q) ||
      normalizeForSearch(rt.category).includes(q)
    );
  }, [searchQuery, availableResourceTypes]);

  // Filter namespaces (synchronous)
  const filteredNamespaces = useMemo(() => {
    if (!adapter.supportsNamespaces) return [];
    const q = normalizeForSearch(searchQuery);
    return adapter.getNamespaces().filter(ns => 
      normalizeForSearch(ns.name).includes(q)
    );
  }, [searchQuery, adapter]);

  // Compute synchronous results based on mode
  const syncResults = useMemo((): SearchResult[] => {
    if (searchMode === 'resources') {
      return filteredResourceTypes.map(rt => adapter.resourceTypeToSearchResult(rt));
    }
    
    if (searchMode === 'namespaces' && adapter.supportsNamespaces && adapter.namespaceToSearchResult) {
      return filteredNamespaces.map(ns => adapter.namespaceToSearchResult!(ns));
    }
    
    // search and searchAll modes use async results
    return [];
  }, [searchMode, filteredResourceTypes, filteredNamespaces, adapter]);

  // Final results: sync results or async results depending on mode
  const results = (searchMode === 'search' || searchMode === 'searchAll') ? asyncResults : syncResults;
  
  // Compute isSearching synchronously based on search state changes
  const shouldStartSearching = (searchMode === 'search' || searchMode === 'searchAll') && 
    searchQuery.length >= 2 && isInitialized;
  
  // Track previous searchMode and syncResults for focusedIndex reset using state
  const [trackedSearchMode, setTrackedSearchMode] = useState(searchMode);
  const [trackedSyncResultsLength, setTrackedSyncResultsLength] = useState(syncResults.length);
  
  // Reset focused index during render when search mode or sync results change
  if (searchMode !== trackedSearchMode) {
    setTrackedSearchMode(searchMode);
    setTrackedSyncResultsLength(syncResults.length);
    if (searchMode !== 'search' && searchMode !== 'searchAll') {
      setFocusedIndex(0);
    }
  } else if (searchMode !== 'search' && searchMode !== 'searchAll' && syncResults.length !== trackedSyncResultsLength) {
    setTrackedSyncResultsLength(syncResults.length);
    setFocusedIndex(0);
  }
  
  // Track whether we're starting a new search to set isSearching during render
  const [trackedShouldSearch, setTrackedShouldSearch] = useState(shouldStartSearching);
  if (shouldStartSearching && !trackedShouldSearch) {
    setTrackedShouldSearch(true);
    setIsSearching(true);
  } else if (!shouldStartSearching && trackedShouldSearch) {
    setTrackedShouldSearch(false);
  }

  // Trigger async search when in search mode
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (shouldStartSearching) {
      // isSearching is set during render, not here
      searchTimeoutRef.current = setTimeout(async () => {
        const results = await adapter.searchResources(searchQuery, searchMode === 'searchAll');
        setAsyncResults(results);
        setFocusedIndex(0);
        setIsSearching(false);
      }, 300);
    }

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [shouldStartSearching, searchMode, searchQuery, adapter]);
  
  // Clear async state synchronously when search mode changes or query is too short
  const shouldClearSearch = (searchMode === 'search' || searchMode === 'searchAll') && 
    searchQuery.length < 2 && asyncResults.length > 0;
  if (shouldClearSearch) {
    setAsyncResults([]);
    setIsSearching(false);
  }

  // Handle selection
  const handleSelect = useCallback((result: SearchResult) => {
    adapter.handleSelect(result);
  }, [adapter]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex(prev => Math.min(prev + 1, results.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (results[focusedIndex]) {
          handleSelect(results[focusedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  }, [results, focusedIndex, handleSelect, onClose]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  // Scroll focused item into view
  useEffect(() => {
    if (focusedIndex >= 0 && listRef.current) {
      const focusedElement = listRef.current.querySelector(`[data-index="${focusedIndex}"]`);
      focusedElement?.scrollIntoView({ block: 'nearest' });
    }
  }, [focusedIndex]);

  // Get placeholder from adapter
  const placeholder = useMemo(() => {
    return adapter.getPlaceholder(searchMode, adapter.getCurrentScopeLabel?.() ?? undefined);
  }, [adapter, searchMode]);

  // Get help items from adapter
  const helpItems = useMemo(() => adapter.getHelpItems(), [adapter]);

  if (!isOpen) return null;

  return createPortal(
    <div 
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      
      {/* Palette */}
      <div className="relative w-full max-w-2xl mx-4 bg-white dark:bg-neutral-900 rounded-xl shadow-2xl border border-neutral-200 dark:border-neutral-700 overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-neutral-200 dark:border-neutral-700">
          <Search size={20} className="text-neutral-400 dark:text-neutral-500 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 outline-none text-base"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          {isSearching && (
            <div className="shrink-0 w-4 h-4 border-2 border-neutral-300 dark:border-neutral-600 border-t-neutral-500 dark:border-t-neutral-400 rounded-full animate-spin" />
          )}
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[60vh] overflow-y-auto">
          {results.length === 0 ? (
            <div className="px-4 py-8 text-center text-neutral-500 dark:text-neutral-400">
              {isSearching ? (
                'Searching...'
              ) : searchQuery.length > 0 && (searchMode === 'search' || searchMode === 'searchAll') && searchQuery.length < 2 ? (
                'Type at least 2 characters to search'
              ) : searchQuery.length > 0 ? (
                'No results found'
              ) : (
                <div className="space-y-2">
                  <p>Type to search or use prefixes:</p>
                  <div className="text-sm space-y-1">
                    {helpItems.map(item => (
                      <p key={item.prefix}>
                        <kbd className="px-1.5 py-0.5 bg-neutral-100 dark:bg-neutral-800 rounded text-xs">{item.prefix}</kbd> {item.label}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="py-2">
              {results.map((result, index) => {
                const Icon = result.icon;
                const isFocused = index === focusedIndex;
                
                return (
                  <div
                    key={result.id}
                    data-index={index}
                    onClick={() => handleSelect(result)}
                    className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer ${
                      isFocused 
                        ? 'bg-neutral-100 dark:bg-neutral-800' 
                        : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
                    }`}
                  >
                    <Icon 
                      size={18} 
                      className={`shrink-0 ${
                        result.type === 'namespace' 
                          ? 'text-blue-500' 
                          : result.type === 'resource'
                          ? 'text-green-500'
                          : 'text-neutral-400 dark:text-neutral-500'
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-neutral-900 dark:text-neutral-100 truncate">
                        {result.label}
                      </div>
                      {result.sublabel && (
                        <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                          {result.sublabel}
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 text-xs text-neutral-400 dark:text-neutral-500">
                      {result.type === 'resource-type' && 'Type'}
                      {result.type === 'namespace' && 'Namespace'}
                      {result.type === 'resource' && 'Resource'}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-neutral-200 dark:border-neutral-700 text-xs text-neutral-400 dark:text-neutral-500">
          <div className="flex items-center gap-4">
            <span><kbd className="px-1 py-0.5 bg-neutral-100 dark:bg-neutral-800 rounded">↑↓</kbd> Navigate</span>
            <span><kbd className="px-1 py-0.5 bg-neutral-100 dark:bg-neutral-800 rounded">↵</kbd> Select</span>
            <span><kbd className="px-1 py-0.5 bg-neutral-100 dark:bg-neutral-800 rounded">esc</kbd> Close</span>
          </div>
          {adapter.getCurrentScopeLabel?.() && searchMode === 'search' && (
            <span>Scope: {adapter.getCurrentScopeLabel()}</span>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
