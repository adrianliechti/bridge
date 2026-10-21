import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search } from 'lucide-react';
import type {
  CommandPaletteAdapter,
  SearchResult,
  ParsedQuery,
  ResourceTypeItem,
} from '../types/commandPalette';

// Normalize string for fuzzy matching (remove hyphens, underscores, dots)
function normalizeForSearch(str: string): string {
  return str.toLowerCase().replace(/[-_.]/g, '');
}

const EMPTY_RESULTS: SearchResult[] = [];
const EMPTY_RESOURCE_TYPES: ResourceTypeItem[] = [];

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  adapter: CommandPaletteAdapter;
}

export function CommandPalette({ isOpen, onClose, adapter }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [searchState, setSearchState] = useState<{
    adapter: CommandPaletteAdapter;
    key: string;
    results: SearchResult[];
    error?: string;
  } | null>(null);
  const [initialization, setInitialization] = useState<{
    adapter: CommandPaletteAdapter;
    types: ResourceTypeItem[];
    error?: string;
  } | null>(null);
  const [retryAttempt, setRetryAttempt] = useState(0);

  // Track pre-completion input for escape revert behavior
  const [preCompletionInput, setPreCompletionInput] = useState<string | null>(null);

  // Track the adapter and isOpen in state to detect changes during render
  const [wasOpen, setWasOpen] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const isInitialized = initialization?.adapter === adapter && !initialization.error;
  const availableResourceTypes = isInitialized ? initialization.types : EMPTY_RESOURCE_TYPES;
  const initializationError =
    initialization?.adapter === adapter ? initialization.error : undefined;

  useEffect(() => {
    let cancelled = false;
    adapter.initialize().then(
      () => {
        if (!cancelled) setInitialization({ adapter, types: adapter.getAvailableResourceTypes() });
      },
      (error) => {
        if (!cancelled)
          setInitialization({
            adapter,
            types: [],
            error: error instanceof Error ? error.message : 'Unable to load search',
          });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [adapter, retryAttempt]);

  // Detect palette opening during render and reset state
  if (isOpen && !wasOpen) {
    setWasOpen(true);
    setQuery('');
    setFocusedIndex(0);
    setSearchState(null);
    setPreCompletionInput(null);
  } else if (!isOpen && wasOpen) {
    setWasOpen(false);
  }

  // Parse query to extract mode, resource kind, and search term
  // Examples:
  //   ":pods" -> { mode: 'resources', resourceKind: 'pods', query: '', allNamespaces: false }
  //   ":pods nginx" -> { mode: 'search', resourceKind: 'pods', query: 'nginx', allNamespaces: false }
  //   "::pods nginx" -> { mode: 'search', resourceKind: 'pods', query: 'nginx', allNamespaces: true }
  //   ":ns prod" -> { mode: 'namespaces', query: 'prod', allNamespaces: false }
  //   ":ctx staging" -> { mode: 'contexts', query: 'staging', allNamespaces: false }
  //   "/filter" -> { mode: 'filter', query: 'filter', allNamespaces: false }
  const parsedQuery = useMemo((): ParsedQuery => {
    const trimmed = query.trim();

    // Check for filter mode first (/)
    if (trimmed.startsWith('/')) {
      return {
        mode: 'filter',
        query: trimmed.slice(1).trim(),
        allNamespaces: false,
        prefix: '/',
      };
    }

    // Check for all-namespaces search (::)
    const allNamespaces = trimmed.startsWith('::');
    const prefix = allNamespaces ? '::' : trimmed.startsWith(':') ? ':' : '';

    if (!prefix) {
      // Plain search in current namespace
      return {
        mode: 'search',
        query: trimmed,
        allNamespaces: false,
        prefix: '',
      };
    }

    // Parse ":resourceType query" or "::resourceType query"
    const afterPrefix = trimmed.slice(prefix.length).trim();
    const spaceIndex = afterPrefix.indexOf(' ');

    if (spaceIndex === -1) {
      // No space: either typing resource type or exact match
      // Check if it matches a known resource type
      const resourceType = isInitialized ? adapter.findResourceType?.(afterPrefix) : undefined;

      if (resourceType) {
        // Check for special types
        if (resourceType.kind === 'namespaces') {
          return { mode: 'namespaces', query: '', allNamespaces, prefix };
        }
        if (resourceType.kind === 'contexts') {
          return { mode: 'contexts', query: '', allNamespaces: false, prefix };
        }
        // Exact resource type match, show that type's resources
        return {
          mode: 'resources',
          resourceKind: resourceType.kind,
          query: '',
          allNamespaces,
          prefix,
        };
      }

      // Partial match or no match - show resource types filtered
      return { mode: 'resources', query: afterPrefix, allNamespaces, prefix };
    }

    // Has space: "resourceType query"
    const firstWord = afterPrefix.slice(0, spaceIndex);
    const searchQuery = afterPrefix.slice(spaceIndex + 1).trim();

    const resourceType = isInitialized ? adapter.findResourceType?.(firstWord) : undefined;

    if (resourceType) {
      // Check for special types with query
      if (resourceType.kind === 'namespaces') {
        return { mode: 'namespaces', query: searchQuery, allNamespaces, prefix };
      }
      if (resourceType.kind === 'contexts') {
        return { mode: 'contexts', query: searchQuery, allNamespaces: false, prefix };
      }
      // Search within specific resource type
      return {
        mode: 'search',
        resourceKind: resourceType.kind,
        query: searchQuery,
        allNamespaces,
        prefix,
      };
    }

    // Unknown resource type, treat as plain search
    return { mode: 'search', query: afterPrefix, allNamespaces, prefix };
  }, [query, adapter, isInitialized]);

  const { mode: searchMode, resourceKind, query: searchQuery, allNamespaces } = parsedQuery;

  // Filter resource types (synchronous) - includes matching by aliases
  const filteredResourceTypes = useMemo(() => {
    const q = normalizeForSearch(searchQuery);
    return availableResourceTypes.filter(
      (rt) =>
        normalizeForSearch(rt.label).includes(q) ||
        normalizeForSearch(rt.kind).includes(q) ||
        normalizeForSearch(rt.category).includes(q) ||
        rt.aliases?.some((alias) => normalizeForSearch(alias).includes(q)),
    );
  }, [searchQuery, availableResourceTypes]);

  // Filter namespaces (synchronous)
  const filteredNamespaces = useMemo(() => {
    if (!adapter.supportsNamespaces) return [];
    const q = normalizeForSearch(searchQuery);
    return adapter.getNamespaces().filter((ns) => normalizeForSearch(ns.name).includes(q));
  }, [searchQuery, adapter]);

  // Filter contexts (synchronous)
  const filteredContexts = useMemo(() => {
    if (!adapter.supportsContexts || !adapter.getContexts) return [];
    const q = normalizeForSearch(searchQuery);
    return adapter
      .getContexts()
      .filter(
        (ctx) =>
          normalizeForSearch(ctx.name).includes(q) ||
          (ctx.cluster && normalizeForSearch(ctx.cluster).includes(q)),
      );
  }, [searchQuery, adapter]);

  // Compute synchronous results based on mode
  const syncResults = useMemo((): SearchResult[] => {
    if (searchMode === 'resources') {
      return filteredResourceTypes.map((rt) => adapter.resourceTypeToSearchResult(rt));
    }

    if (
      searchMode === 'namespaces' &&
      adapter.supportsNamespaces &&
      adapter.namespaceToSearchResult
    ) {
      return filteredNamespaces.map((ns) => adapter.namespaceToSearchResult!(ns));
    }

    if (
      searchMode === 'contexts' &&
      adapter.supportsContexts &&
      adapter.contextToSearchResult &&
      adapter.getContexts
    ) {
      return filteredContexts.map((ctx) => adapter.contextToSearchResult!(ctx));
    }

    // search, searchAll, and filter modes use async results
    return [];
  }, [searchMode, filteredResourceTypes, filteredNamespaces, filteredContexts, adapter]);

  // Final results: sync results or async results depending on mode
  const isAsyncSearch =
    searchMode === 'search' || searchMode === 'searchAll' || searchMode === 'filter';
  const shouldStartSearching = isOpen && isAsyncSearch && searchQuery.length >= 2 && isInitialized;
  const searchKey = JSON.stringify([
    searchMode,
    searchQuery,
    allNamespaces,
    resourceKind,
    retryAttempt,
  ]);
  const currentSearch =
    searchState?.adapter === adapter && searchState.key === searchKey ? searchState : null;
  const results = isAsyncSearch
    ? shouldStartSearching
      ? (currentSearch?.results ?? EMPTY_RESULTS)
      : EMPTY_RESULTS
    : syncResults;
  const isSearching = shouldStartSearching && !currentSearch;
  const searchError =
    initializationError ?? (shouldStartSearching ? currentSearch?.error : undefined);

  // Track previous searchMode and syncResults for focusedIndex reset using state
  const [trackedSearchMode, setTrackedSearchMode] = useState(searchMode);
  const [trackedSyncResultsLength, setTrackedSyncResultsLength] = useState(syncResults.length);

  // Reset focused index during render when search mode or sync results change
  if (searchMode !== trackedSearchMode) {
    setTrackedSearchMode(searchMode);
    setTrackedSyncResultsLength(syncResults.length);
    if (searchMode !== 'search' && searchMode !== 'searchAll' && searchMode !== 'filter') {
      setFocusedIndex(0);
    }
  } else if (
    searchMode !== 'search' &&
    searchMode !== 'searchAll' &&
    searchMode !== 'filter' &&
    syncResults.length !== trackedSyncResultsLength
  ) {
    setTrackedSyncResultsLength(syncResults.length);
    setFocusedIndex(0);
  }

  useEffect(() => {
    if (!shouldStartSearching) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const results = await adapter.searchResources(searchQuery, allNamespaces, resourceKind);
        if (cancelled) return;
        setSearchState({ adapter, key: searchKey, results });
        setFocusedIndex(0);
      } catch (error) {
        if (cancelled) return;
        setSearchState({
          adapter,
          key: searchKey,
          results: [],
          error: error instanceof Error ? error.message : 'Search failed',
        });
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [shouldStartSearching, searchKey, searchQuery, allNamespaces, resourceKind, adapter]);

  // Handle selection
  const handleSelect = useCallback(
    (result: SearchResult) => {
      // Virtual "Contexts" type (no backing resource config): selecting it
      // enters context-search mode instead of navigating, same as typing :ctx.
      // The adapter's handleSelect can't do this — it has no access to the query.
      if (
        result.type === 'resource-type' &&
        result.data?.kind === 'contexts' &&
        !result.data?.resourceConfig
      ) {
        setQuery(':ctx ');
        return;
      }
      adapter.handleSelect(result);
    },
    [adapter],
  );

  // Handle tab completion
  const handleTabComplete = useCallback(
    (shift: boolean) => {
      if (results.length === 0) return;

      // Store current input before completion if not already stored
      if (preCompletionInput === null) {
        setPreCompletionInput(query);
      }

      // Get the focused result
      const focusedResult = results[focusedIndex];
      if (!focusedResult) return;

      // Get completion value from the focused result
      const completionValue = focusedResult.completionValue || focusedResult.label;

      // Build the new query based on current mode
      let newQuery: string;
      const prefix = parsedQuery.prefix;

      if (searchMode === 'resources' && focusedResult.type === 'resource-type') {
        // Completing a resource type - add space after for search
        newQuery = `${prefix}${completionValue} `;
      } else if (searchMode === 'namespaces' || searchMode === 'contexts') {
        // Completing namespace or context
        const typePrefix = searchMode === 'namespaces' ? 'ns' : 'ctx';
        newQuery = `${prefix}${typePrefix} ${completionValue}`;
      } else if (searchMode === 'search' || searchMode === 'searchAll') {
        // Completing a resource name within a type search
        if (parsedQuery.resourceKind) {
          newQuery = `${prefix}${parsedQuery.resourceKind} ${completionValue}`;
        } else {
          newQuery = `${prefix}${completionValue}`;
        }
      } else if (searchMode === 'filter') {
        newQuery = `/${completionValue}`;
      } else {
        newQuery = completionValue;
      }

      setQuery(newQuery);

      // If there are multiple results with the same completion, cycle through them
      if (results.length > 1) {
        if (shift) {
          setFocusedIndex((prev) => (prev - 1 + results.length) % results.length);
        } else {
          setFocusedIndex((prev) => (prev + 1) % results.length);
        }
      }
    },
    [results, focusedIndex, preCompletionInput, query, searchMode, parsedQuery],
  );

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setFocusedIndex((prev) => Math.min(prev + 1, results.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setFocusedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case 'Tab':
          e.preventDefault();
          handleTabComplete(e.shiftKey);
          break;
        case 'Enter':
          e.preventDefault();
          if (results[focusedIndex]) {
            handleSelect(results[focusedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          // If we have a pre-completion input, revert to it first
          if (preCompletionInput !== null) {
            setQuery(preCompletionInput);
            setPreCompletionInput(null);
          } else {
            onClose();
          }
          break;
      }
    },
    [results, focusedIndex, handleSelect, handleTabComplete, preCompletionInput, onClose],
  );

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
      role="dialog"
      aria-modal="true"
      aria-label="Search resources"
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
          {searchError ? (
            <div role="alert" className="px-4 py-6 text-sm text-red-600 dark:text-red-400">
              {searchError}
              <button
                onClick={() => setRetryAttempt((attempt) => attempt + 1)}
                className="ml-3 underline"
              >
                Retry
              </button>
            </div>
          ) : results.length === 0 ? (
            <div className="px-4 py-8 text-center text-neutral-500 dark:text-neutral-400">
              {isSearching ? (
                'Searching...'
              ) : searchQuery.length > 0 &&
                (searchMode === 'search' || searchMode === 'searchAll') &&
                searchQuery.length < 2 ? (
                'Type at least 2 characters to search'
              ) : searchQuery.length > 0 ? (
                'No results found'
              ) : (
                <div className="space-y-2">
                  <p>Type to search or use prefixes:</p>
                  <div className="text-sm space-y-1">
                    {helpItems.map((item) => (
                      <p key={item.prefix}>
                        <kbd className="px-1.5 py-0.5 bg-neutral-100 dark:bg-neutral-800 rounded text-xs">
                          {item.prefix}
                        </kbd>{' '}
                        {item.label}
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
                          : result.type === 'context'
                            ? 'text-purple-500'
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
                    <div className="shrink-0 flex items-center gap-2">
                      {isFocused && (
                        <span className="text-xs text-neutral-400 dark:text-neutral-500">⇥</span>
                      )}
                      <span className="text-xs text-neutral-400 dark:text-neutral-500">
                        {result.type === 'resource-type' && 'Type'}
                        {result.type === 'namespace' && 'Namespace'}
                        {result.type === 'context' && 'Context'}
                        {result.type === 'resource' && 'Resource'}
                      </span>
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
            <span>
              <kbd className="px-1 py-0.5 bg-neutral-100 dark:bg-neutral-800 rounded">↑↓</kbd>{' '}
              Navigate
            </span>
            <span>
              <kbd className="px-1 py-0.5 bg-neutral-100 dark:bg-neutral-800 rounded">⇥</kbd>{' '}
              Complete
            </span>
            <span>
              <kbd className="px-1 py-0.5 bg-neutral-100 dark:bg-neutral-800 rounded">↵</kbd> Select
            </span>
            <span>
              <kbd className="px-1 py-0.5 bg-neutral-100 dark:bg-neutral-800 rounded">esc</kbd>{' '}
              {preCompletionInput !== null ? 'Revert' : 'Close'}
            </span>
          </div>
          {adapter.getCurrentScopeLabel?.() && searchMode === 'search' && (
            <span>Scope: {adapter.getCurrentScopeLabel()}</span>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
