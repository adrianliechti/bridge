import {
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
  Network,
  ShieldCheck,
  FileCheck,
  AppWindow,
  LayoutGrid,
} from 'lucide-react';
import { getResourceConfig } from '../../api/kubernetes/kubernetesDiscovery';
import { getResourceTable, type V1APIResource } from '../../api/kubernetes/kubernetesTable';
import type {
  CommandPaletteAdapter,
  ResourceTypeItem,
  NamespaceItem,
  SearchResult,
  SearchMode,
} from '../../types/commandPalette';

// Normalize string for fuzzy matching (remove hyphens, underscores, dots)
function normalizeForSearch(str: string): string {
  return str.toLowerCase().replace(/[-_.]/g, '');
}

// Kubernetes resource types with icons
const kubernetesResourceTypes: ResourceTypeItem[] = [
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
];

interface KubernetesAdapterOptions {
  context: string;
  namespace?: string;
  namespaces: Array<{ metadata?: { name?: string } }>;
  setNamespace: (ns: string | undefined) => void;
  setSelectedResource: (resource: V1APIResource) => void;
  onClose: () => void;
}

export function createKubernetesAdapter(options: KubernetesAdapterOptions): CommandPaletteAdapter {
  const { context, namespace, namespaces, setNamespace, setSelectedResource, onClose } = options;
  
  // Cache for resource configs
  let resourceConfigCache = new Map<string, V1APIResource>();

  const adapter: CommandPaletteAdapter = {
    id: 'kubernetes',
    resourceTypes: kubernetesResourceTypes,
    supportsNamespaces: true,
    
    searchModePrefixes: [
      { prefix: '@@', mode: 'searchAll' },
      { prefix: '>', mode: 'resources' },
      { prefix: '@', mode: 'namespaces' },
    ],

    async initialize() {
      const configs = new Map<string, V1APIResource>();
      for (const rt of kubernetesResourceTypes) {
        try {
          const config = await getResourceConfig(context, rt.kind);
          if (config) {
            configs.set(rt.kind, config);
          }
        } catch {
          // Resource type not available in cluster
        }
      }
      resourceConfigCache = configs;
    },

    getAvailableResourceTypes(): ResourceTypeItem[] {
      return kubernetesResourceTypes.filter(rt => resourceConfigCache.has(rt.kind));
    },

    getNamespaces(): NamespaceItem[] {
      return namespaces
        .filter(ns => ns.metadata?.name)
        .map(ns => ({ name: ns.metadata!.name! }));
    },

    resourceTypeToSearchResult(item: ResourceTypeItem): SearchResult {
      return {
        id: `type-${item.kind}`,
        type: 'resource-type',
        label: item.label,
        sublabel: item.category,
        icon: item.icon,
        category: item.category,
        data: {
          resourceConfig: resourceConfigCache.get(item.kind),
        },
      };
    },

    namespaceToSearchResult(item: NamespaceItem): SearchResult {
      return {
        id: `ns-${item.name}`,
        type: 'namespace',
        label: item.name,
        icon: FolderOpen,
        data: { namespace: item.name },
      };
    },

    async searchResources(query: string, allScopes: boolean): Promise<SearchResult[]> {
      if (!query || query.length < 2) {
        return [];
      }

      const searchResults: SearchResult[] = [];
      const searchNormalized = normalizeForSearch(query);
      const targetNamespace = allScopes ? undefined : namespace;

      const searchPromises = kubernetesResourceTypes
        .filter(rt => resourceConfigCache.has(rt.kind))
        .map(async (rt) => {
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
        if (config) {
          setSelectedResource(config);
        }
      } else if (result.type === 'namespace') {
        setNamespace(result.data.namespace as string);
      } else if (result.type === 'resource') {
        const config = result.data.resourceConfig as V1APIResource | undefined;
        const resourceNamespace = result.data.namespace as string | undefined;
        
        // Switch namespace if needed
        if (resourceNamespace && resourceNamespace !== namespace) {
          setNamespace(resourceNamespace);
        }
        if (config) {
          setSelectedResource(config);
        }
      }
      onClose();
    },

    getPlaceholder(searchMode: SearchMode, currentScope?: string): string {
      switch (searchMode) {
        case 'resources':
          return 'Search resource types...';
        case 'namespaces':
          return 'Search namespaces...';
        case 'searchAll':
          return 'Search resources across all namespaces...';
        default:
          return `Search resources in ${currentScope || namespace || 'current namespace'}... (> types, @ ns, @@ all)`;
      }
    },

    getHelpItems() {
      return [
        { prefix: '>', label: 'Resource types' },
        { prefix: '@', label: 'Namespaces' },
        { prefix: '@@', label: 'Search all namespaces' },
      ];
    },

    getCurrentScopeLabel(): string | null {
      return namespace || null;
    },
  };

  return adapter;
}
