import {
  MonitorCog,
  FolderOpen,
} from 'lucide-react';
import { getResourceConfig } from '../../api/kubernetes/kubernetesDiscovery';
import { getResourceTable, type V1APIResource } from '../../api/kubernetes/kubernetesTable';
import type {
  CommandPaletteAdapter,
  ResourceTypeItem,
  NamespaceItem,
  ContextItem,
  SearchResult,
  SearchMode,
} from '../../types/commandPalette';
import {
  builtInResourceTypes,
  categoryLabels,
  getResourceIcon,
  getResourceAliases,
  type ResourceTypeConfig,
} from './resourceTypes';

// Normalize string for fuzzy matching (remove hyphens, underscores, dots)
function normalizeForSearch(str: string): string {
  return str.toLowerCase().replace(/[-_.]/g, '');
}

// Virtual resources for command palette (contexts with ctx/context aliases)
const commandPaletteVirtualResources: ResourceTypeItem[] = [
  { kind: 'contexts', label: 'Contexts', icon: MonitorCog, category: 'Cluster', aliases: ['ctx', 'context'] },
];

/**
 * Build ResourceTypeItem from V1APIResource + shared config
 */
function buildResourceTypeItem(config: V1APIResource, resourceConfig?: ResourceTypeConfig): ResourceTypeItem {
  const aliases = getResourceAliases(config);
  const icon = resourceConfig?.icon ?? getResourceIcon(config.name);
  const category = resourceConfig?.label ? categoryLabels[resourceConfig.category] : 'Other';
  
  return {
    kind: config.name,
    label: config.kind, // Use API's kind as label (e.g., "Pod", "Deployment")
    icon,
    category,
    aliases: aliases.length > 0 ? aliases : undefined,
  };
}

interface KubernetesAdapterOptions {
  context: string;
  namespace?: string;
  namespaces: Array<{ metadata?: { name?: string } }>;
  contexts: Array<{ name: string; cluster?: string }>;
  currentContext: string;
  setNamespace: (ns: string | undefined) => void;
  setContext: (ctx: string) => void;
  setSelectedResource: (resource: V1APIResource) => void;
  setSelectedItem: (resourceType: string, itemName: string, itemNamespace?: string) => void;
  onClose: () => void;
}

/**
 * Find a resource type by plural name, singular name, short name, or label
 */
function findResourceTypeByQuery(
  query: string,
  resourceTypeItems: ResourceTypeItem[]
): ResourceTypeItem | undefined {
  const q = query.toLowerCase();
  
  // First check virtual resources (like contexts)
  const virtual = commandPaletteVirtualResources.find(rt =>
    rt.kind.toLowerCase() === q ||
    rt.label.toLowerCase() === q ||
    rt.aliases?.some(a => a.toLowerCase() === q)
  );
  if (virtual) return virtual;
  
  // Then check discovered resources
  return resourceTypeItems.find(rt => {
    if (rt.kind.toLowerCase() === q) return true;
    if (rt.label.toLowerCase() === q) return true;
    if (rt.aliases?.some(a => a.toLowerCase() === q)) return true;
    return false;
  });
}

export function createKubernetesAdapter(options: KubernetesAdapterOptions): CommandPaletteAdapter {
  const { context, namespace, namespaces, contexts, currentContext, setNamespace, setContext, setSelectedResource, setSelectedItem, onClose } = options;
  
  // Cache for resource configs from discovery API
  let resourceConfigCache = new Map<string, V1APIResource>();
  // Built resource type items (from discovery + metadata)
  let resourceTypeItems: ResourceTypeItem[] = [];

  const adapter: CommandPaletteAdapter = {
    id: 'kubernetes',
    resourceTypes: [], // Will be populated after initialize()
    supportsNamespaces: true,
    supportsContexts: true,
    
    searchModePrefixes: [
      { prefix: '::', mode: 'searchAll' },
      { prefix: ':', mode: 'resources' },
      { prefix: '/', mode: 'filter' },
    ],

    async initialize() {
      const configs = new Map<string, V1APIResource>();
      const items: ResourceTypeItem[] = [];
      
      // Fetch configs for built-in resource types
      for (const rt of builtInResourceTypes) {
        try {
          const config = await getResourceConfig(context, rt.kind);
          if (config) {
            configs.set(rt.kind, config);
            items.push(buildResourceTypeItem(config, rt));
          }
        } catch {
          // Resource type not available in cluster
        }
      }
      
      resourceConfigCache = configs;
      resourceTypeItems = items;
      adapter.resourceTypes = [...items, ...commandPaletteVirtualResources];
    },

    getAvailableResourceTypes(): ResourceTypeItem[] {
      // Include all types that have API resources, plus virtual types like contexts
      return resourceTypeItems.filter(rt => 
        resourceConfigCache.has(rt.kind) || rt.kind === 'contexts'
      );
    },

    getNamespaces(): NamespaceItem[] {
      return namespaces
        .filter(ns => ns.metadata?.name)
        .map(ns => ({ name: ns.metadata!.name! }));
    },

    getContexts(): ContextItem[] {
      return contexts.map(ctx => ({
        name: ctx.name,
        cluster: ctx.cluster,
        isCurrent: ctx.name === currentContext,
      }));
    },

    findResourceType(query: string): ResourceTypeItem | undefined {
      return findResourceTypeByQuery(query, resourceTypeItems);
    },

    resourceTypeToSearchResult(item: ResourceTypeItem): SearchResult {
      // Get aliases from discovery API for display
      const config = resourceConfigCache.get(item.kind);
      const aliases = getResourceAliases(config);
      // For virtual types like 'contexts', use hardcoded aliases
      const displayAliases = aliases.length > 0 ? aliases : item.aliases;
      
      return {
        id: `type-${item.kind}`,
        type: 'resource-type',
        label: item.label,
        sublabel: displayAliases?.length ? `${item.category} · ${displayAliases.join(', ')}` : item.category,
        icon: item.icon,
        category: item.category,
        data: {
          resourceConfig: config,
          kind: item.kind,
        },
        completionValue: item.kind,
      };
    },

    namespaceToSearchResult(item: NamespaceItem): SearchResult {
      return {
        id: `ns-${item.name}`,
        type: 'namespace',
        label: item.name,
        icon: FolderOpen,
        data: { namespace: item.name },
        completionValue: item.name,
      };
    },

    contextToSearchResult(item: ContextItem): SearchResult {
      return {
        id: `ctx-${item.name}`,
        type: 'context',
        label: item.name,
        sublabel: item.isCurrent ? 'Current context' : item.cluster,
        icon: MonitorCog,
        data: { context: item.name },
        completionValue: item.name,
      };
    },

    async searchResources(query: string, allScopes: boolean, resourceKind?: string): Promise<SearchResult[]> {
      if (!query || query.length < 2) {
        return [];
      }

      const searchResults: SearchResult[] = [];
      const searchNormalized = normalizeForSearch(query);
      const targetNamespace = allScopes ? undefined : namespace;

      // Determine which resource types to search
      let resourcesToSearch = resourceTypeItems.filter(rt => 
        resourceConfigCache.has(rt.kind)
      );
      
      // Filter by specific resource kind if provided
      if (resourceKind) {
        const targetType = findResourceTypeByQuery(resourceKind, resourceTypeItems);
        if (targetType && resourceConfigCache.has(targetType.kind)) {
          resourcesToSearch = [targetType];
        } else {
          // Invalid resource kind, return empty
          return [];
        }
      }

      const searchPromises = resourcesToSearch.map(async (rt: ResourceTypeItem) => {
          const config = resourceConfigCache.get(rt.kind);
          if (!config) return [];

          try {
            const table = await getResourceTable(context, config, targetNamespace);
            const matches: SearchResult[] = [];
            
            for (const row of table.rows) {
              if (!row.object.metadata) continue;
              const name = row.object.metadata.name;
              const rowNamespace = row.object.metadata.namespace;
              
              if (name && normalizeForSearch(name).includes(searchNormalized)) {
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
                  completionValue: name,
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

      return searchResults.slice(0, 50);
    },

    handleSelect(result: SearchResult): void {
      if (result.type === 'resource-type') {
        const config = result.data.resourceConfig as V1APIResource | undefined;
        const kind = result.data.kind as string | undefined;
        
        // Special handling for virtual types
        if (kind === 'contexts') {
          // Don't close, let the adapter show contexts list
          return;
        }
        
        if (config) {
          setSelectedResource(config);
        }
      } else if (result.type === 'namespace') {
        setNamespace(result.data.namespace as string);
      } else if (result.type === 'context') {
        setContext(result.data.context as string);
      } else if (result.type === 'resource') {
        const config = result.data.resourceConfig as V1APIResource | undefined;
        const resourceNamespace = result.data.namespace as string | undefined;
        const resourceName = result.data.resourceName as string | undefined;
        
        // Switch namespace if needed
        if (resourceNamespace && resourceNamespace !== namespace) {
          setNamespace(resourceNamespace);
        }
        
        // Navigate directly to the specific resource
        if (config && resourceName) {
          setSelectedItem(config.name, resourceName, resourceNamespace);
        } else if (config) {
          setSelectedResource(config);
        }
      }
      onClose();
    },

    getPlaceholder(searchMode: SearchMode, currentScope?: string): string {
      switch (searchMode) {
        case 'resources':
          return 'Type resource name (e.g., pods, :ns, :ctx)...';
        case 'namespaces':
          return 'Search namespaces...';
        case 'contexts':
          return 'Search contexts...';
        case 'searchAll':
          return 'Search resources across all namespaces...';
        case 'filter':
          return 'Filter current view...';
        default:
          return `Search in ${currentScope || namespace || 'all namespaces'}... (:pods, ::pods, /filter)`;
      }
    },

    getHelpItems() {
      return [
        { prefix: ':pods', label: 'Resource types (po, deploy, svc...)' },
        { prefix: '::pods', label: 'Search all namespaces' },
        { prefix: ':ns', label: 'Switch namespace' },
        { prefix: ':ctx', label: 'Switch context' },
        { prefix: '/', label: 'Filter current view' },
      ];
    },

    getCurrentScopeLabel(): string | null {
      return namespace || null;
    },
  };

  return adapter;
}
