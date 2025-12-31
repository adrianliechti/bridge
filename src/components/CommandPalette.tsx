import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Search,
  Box,
  Rocket,
  Layers,
  Ghost,
  Database,
  Zap,
  Clock,
  FileText,
  KeyRound,
  Plug,
  Globe,
  HardDrive,
  Disc,
  FolderOpen,
  Server,
  Newspaper,
  Network,
  ShieldCheck,
  FileCheck,
  AppWindow,
  LayoutGrid,
  type LucideIcon,
} from 'lucide-react';
import { useCluster } from '../hooks/useCluster';
import { getResourceConfig } from '../api/kubernetesDiscovery';
import { getResourceTable, type V1APIResource } from '../api/kubernetesTable';

// Resource type definitions with icons (matching ResourceSidebar)
interface ResourceTypeItem {
  kind: string;
  label: string;
  icon: LucideIcon;
  category: string;
}

const resourceTypes: ResourceTypeItem[] = [
  // Workloads
  { kind: 'pods', label: 'Pods', icon: Box, category: 'Workloads' },
  { kind: 'deployments', label: 'Deployments', icon: Rocket, category: 'Workloads' },
  { kind: 'daemonsets', label: 'DaemonSets', icon: Ghost, category: 'Workloads' },
  { kind: 'statefulsets', label: 'StatefulSets', icon: Database, category: 'Workloads' },
  { kind: 'replicasets', label: 'ReplicaSets', icon: Layers, category: 'Workloads' },
  { kind: 'jobs', label: 'Jobs', icon: Zap, category: 'Workloads' },
  { kind: 'cronjobs', label: 'CronJobs', icon: Clock, category: 'Workloads' },
  // Config
  { kind: 'secrets', label: 'Secrets', icon: KeyRound, category: 'Config' },
  { kind: 'configmaps', label: 'ConfigMaps', icon: FileText, category: 'Config' },
  { kind: 'applications', label: 'Applications', icon: AppWindow, category: 'Config' },
  { kind: 'applicationsets', label: 'ApplicationSets', icon: LayoutGrid, category: 'Config' },
  { kind: 'certificates', label: 'Certificates', icon: ShieldCheck, category: 'Config' },
  { kind: 'certificaterequests', label: 'CertificateRequests', icon: FileCheck, category: 'Config' },
  // Network
  { kind: 'services', label: 'Services', icon: Plug, category: 'Network' },
  { kind: 'ingresses', label: 'Ingresses', icon: Globe, category: 'Network' },
  { kind: 'gateways', label: 'Gateways', icon: Network, category: 'Network' },
  { kind: 'httproutes', label: 'HTTPRoutes', icon: Globe, category: 'Network' },
  { kind: 'grpcroutes', label: 'GRPCRoutes', icon: Globe, category: 'Network' },
  { kind: 'tcproutes', label: 'TCPRoutes', icon: Network, category: 'Network' },
  { kind: 'udproutes', label: 'UDPRoutes', icon: Network, category: 'Network' },
  { kind: 'tlsroutes', label: 'TLSRoutes', icon: Network, category: 'Network' },
  // Storage
  { kind: 'persistentvolumes', label: 'PersistentVolumes', icon: HardDrive, category: 'Storage' },
  { kind: 'persistentvolumeclaims', label: 'PersistentVolumeClaims', icon: Disc, category: 'Storage' },
  // Cluster
  { kind: 'namespaces', label: 'Namespaces', icon: FolderOpen, category: 'Cluster' },
  { kind: 'nodes', label: 'Nodes', icon: Server, category: 'Cluster' },
  // { kind: 'events', label: 'Events', icon: Newspaper, category: 'Cluster' },
];

// Normalize string for fuzzy matching (remove hyphens, underscores, dots)
function normalizeForSearch(str: string): string {
  return str.toLowerCase().replace(/[-_.]/g, '');
}

// Search modes
type SearchMode = 'default' | 'resources' | 'namespaces' | 'search' | 'searchAll';

interface SearchResult {
  id: string;
  type: 'resource-type' | 'namespace' | 'resource';
  label: string;
  sublabel?: string;
  icon: LucideIcon;
  category?: string;
  data: {
    resourceConfig?: V1APIResource;
    namespace?: string;
    resourceName?: string;
  };
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const { context, namespace, namespaces, setNamespace, setSelectedResource } = useCluster();
  const [query, setQuery] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [asyncResults, setAsyncResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [resourceConfigCache, setResourceConfigCache] = useState<Map<string, V1APIResource>>(new Map());
  
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset query when palette opens (using callback form to avoid effect warnings)
  const handleOpen = useCallback(() => {
    setQuery('');
    setFocusedIndex(0);
    setAsyncResults([]);
  }, []);

  // Track open state changes
  const prevIsOpenRef = useRef(false);
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      handleOpen();
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, handleOpen]);

  // Determine search mode from query prefix
  const { mode, searchQuery } = useMemo(() => {
    if (query.startsWith('@@')) {
      return { mode: 'searchAll' as SearchMode, searchQuery: query.slice(2).trim() };
    }
    if (query.startsWith('>')) {
      return { mode: 'resources' as SearchMode, searchQuery: query.slice(1).trim() };
    }
    if (query.startsWith('@')) {
      return { mode: 'namespaces' as SearchMode, searchQuery: query.slice(1).trim() };
    }
    // Default is now search in current namespace
    return { mode: 'search' as SearchMode, searchQuery: query.trim() };
  }, [query]);

  // Load resource configs on mount
  useEffect(() => {
    const loadConfigs = async () => {
      const configs = new Map<string, V1APIResource>();
      for (const rt of resourceTypes) {
        try {
          const config = await getResourceConfig(context, rt.kind);
          if (config) {
            configs.set(rt.kind, config);
          }
        } catch {
          // Resource type not available in cluster
        }
      }
      setResourceConfigCache(configs);
    };
    if (context) {
      loadConfigs();
    }
  }, [context]);

  // Filter resource types (synchronous)
  const filteredResourceTypes = useMemo(() => {
    const q = normalizeForSearch(searchQuery);
    return resourceTypes
      .filter(rt => resourceConfigCache.has(rt.kind)) // Only show available resources
      .filter(rt => 
        normalizeForSearch(rt.label).includes(q) ||
        normalizeForSearch(rt.kind).includes(q) ||
        normalizeForSearch(rt.category).includes(q)
      );
  }, [searchQuery, resourceConfigCache]);

  // Filter namespaces (synchronous)
  const filteredNamespaces = useMemo(() => {
    const q = normalizeForSearch(searchQuery);
    return namespaces.filter(ns => 
      normalizeForSearch(ns.metadata?.name || '').includes(q)
    );
  }, [searchQuery, namespaces]);

  // Compute synchronous results based on mode
  const syncResults = useMemo((): SearchResult[] => {
    if (mode === 'resources') {
      return filteredResourceTypes.map(rt => ({
        id: `type-${rt.kind}`,
        type: 'resource-type' as const,
        label: rt.label,
        sublabel: rt.category,
        icon: rt.icon,
        category: rt.category,
        data: { resourceConfig: resourceConfigCache.get(rt.kind) },
      }));
    }
    
    if (mode === 'namespaces') {
      return filteredNamespaces.map(ns => ({
        id: `ns-${ns.metadata?.name}`,
        type: 'namespace' as const,
        label: ns.metadata?.name || '',
        icon: FolderOpen,
        data: { namespace: ns.metadata?.name },
      }));
    }
    
    // search and searchAll modes use async results
    return [];
  }, [mode, filteredResourceTypes, filteredNamespaces, resourceConfigCache]);

  // Final results: sync results or async results depending on mode
  const results = (mode === 'search' || mode === 'searchAll') ? asyncResults : syncResults;

  // Search for resources using Table API (async)
  const searchResources = useCallback(async (searchTerm: string, allNamespaces: boolean): Promise<SearchResult[]> => {
    if (!searchTerm || searchTerm.length < 2) {
      return [];
    }

    const searchResults: SearchResult[] = [];
    const searchNormalized = normalizeForSearch(searchTerm);
    const targetNamespace = allNamespaces ? undefined : namespace;

    // Search across all sidebar resource types in parallel
    const searchPromises = resourceTypes
      .filter(rt => resourceConfigCache.has(rt.kind))
      .map(async (rt) => {
        const config = resourceConfigCache.get(rt.kind);
        if (!config) return [];

        try {
          const table = await getResourceTable(context, config, targetNamespace);
          const matches: SearchResult[] = [];
          
          for (const row of table.rows) {
            const name = row.object.metadata.name;
            const rowNamespace = row.object.metadata.namespace;
            
            if (normalizeForSearch(name).includes(searchNormalized)) {
              matches.push({
                id: `${rt.kind}/${rowNamespace || ''}/${name}`,
                type: 'resource',
                label: name,
                sublabel: rowNamespace ? `${rt.label} in ${rowNamespace}` : rt.label,
                icon: rt.icon,
                category: rt.category,
                data: {
                  resourceConfig: config,
                  namespace: rowNamespace,
                  resourceName: name,
                },
              });
            }
          }
          
          return matches;
        } catch {
          // Resource type may not be available or permission denied
          return [];
        }
      });

    const allResults = await Promise.all(searchPromises);
    for (const matches of allResults) {
      searchResults.push(...matches);
    }

    // Sort by relevance (exact match first, then alphabetically)
    searchResults.sort((a, b) => {
      const aExact = normalizeForSearch(a.label) === searchNormalized;
      const bExact = normalizeForSearch(b.label) === searchNormalized;
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      return a.label.localeCompare(b.label);
    });

    return searchResults.slice(0, 50); // Limit results
  }, [context, namespace, resourceConfigCache]);

  // Trigger async search when in search mode
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if ((mode === 'search' || mode === 'searchAll') && searchQuery.length >= 2) {
      setIsSearching(true);
      searchTimeoutRef.current = setTimeout(async () => {
        const results = await searchResources(searchQuery, mode === 'searchAll');
        setAsyncResults(results);
        setFocusedIndex(0);
        setIsSearching(false);
      }, 300);
    } else if (mode === 'search' || mode === 'searchAll') {
      setAsyncResults([]);
      setIsSearching(false);
    }

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [mode, searchQuery, searchResources]);

  // Reset focused index when sync results change
  useEffect(() => {
    if (mode !== 'search' && mode !== 'searchAll') {
      setFocusedIndex(0);
    }
  }, [mode, syncResults]);

  // Handle selection
  const handleSelect = useCallback((result: SearchResult) => {
    if (result.type === 'resource-type') {
      if (result.data.resourceConfig) {
        setSelectedResource(result.data.resourceConfig);
      }
    } else if (result.type === 'namespace') {
      setNamespace(result.data.namespace);
    } else if (result.type === 'resource') {
      // Navigate to the resource type and potentially select the specific resource
      if (result.data.resourceConfig) {
        // If the resource is in a different namespace, switch to it
        if (result.data.namespace && result.data.namespace !== namespace) {
          setNamespace(result.data.namespace);
        }
        setSelectedResource(result.data.resourceConfig);
      }
    }
    onClose();
  }, [setSelectedResource, setNamespace, namespace, onClose]);

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

  // Get placeholder based on mode
  const placeholder = useMemo(() => {
    switch (mode) {
      case 'resources': return 'Search resource types...';
      case 'namespaces': return 'Search namespaces...';
      case 'searchAll': return 'Search resources across all namespaces...';
      default: return `Search resources in ${namespace || 'current namespace'}... (> types, @ ns, @@ all)`;
    }
  }, [mode, namespace]);

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
              ) : searchQuery.length > 0 && (mode === 'search' || mode === 'searchAll') && searchQuery.length < 2 ? (
                'Type at least 2 characters to search'
              ) : searchQuery.length > 0 ? (
                'No results found'
              ) : (
                <div className="space-y-2">
                  <p>Type to search or use prefixes:</p>
                  <div className="text-sm space-y-1">
                    <p><kbd className="px-1.5 py-0.5 bg-neutral-100 dark:bg-neutral-800 rounded text-xs">&gt;</kbd> Resource types</p>
                    <p><kbd className="px-1.5 py-0.5 bg-neutral-100 dark:bg-neutral-800 rounded text-xs">@</kbd> Namespaces</p>
                    <p><kbd className="px-1.5 py-0.5 bg-neutral-100 dark:bg-neutral-800 rounded text-xs">@@</kbd> Search all namespaces</p>
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
          {namespace && mode === 'search' && (
            <span>Scope: {namespace}</span>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
