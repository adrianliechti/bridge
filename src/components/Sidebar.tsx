import { useState, useCallback, useEffect } from 'react';
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
  Newspaper,
  ChevronDown,
  ChevronRight,
  Hexagon,
  type LucideIcon,
} from 'lucide-react';
import { useKubernetesQuery } from '../hooks/useKubernetesQuery';
import { getNamespaces } from '../api/kubernetes';
import { NamespaceSelector } from './NamespaceSelector';
import {
  type BuiltInResourceKind,
  type ResourceSelection,
  type CRDResourceConfig,
  getResourceConfigFromSelection,
  getCRDs,
  crdToResourceConfig,
  builtinResource,
  crdResource,
} from '../api/kubernetesTable';

// Re-export for use in App
export type { ResourceSelection };

interface BuiltInNavItem {
  kind: BuiltInResourceKind;
  label: string;
  icon: LucideIcon;
  category: 'workloads' | 'config' | 'network' | 'storage' | 'cluster';
}

const builtInNavItems: BuiltInNavItem[] = [
  // Workloads
  { kind: 'pods', label: 'Pods', icon: Box, category: 'workloads' },
  { kind: 'deployments', label: 'Deployments', icon: Rocket, category: 'workloads' },
  { kind: 'replicasets', label: 'ReplicaSets', icon: Layers, category: 'workloads' },
  { kind: 'daemonsets', label: 'DaemonSets', icon: Ghost, category: 'workloads' },
  { kind: 'statefulsets', label: 'StatefulSets', icon: Database, category: 'workloads' },
  { kind: 'jobs', label: 'Jobs', icon: Zap, category: 'workloads' },
  { kind: 'cronjobs', label: 'CronJobs', icon: Clock, category: 'workloads' },
  // Config
  { kind: 'configmaps', label: 'ConfigMaps', icon: FileText, category: 'config' },
  { kind: 'secrets', label: 'Secrets', icon: KeyRound, category: 'config' },
  // Network
  { kind: 'services', label: 'Services', icon: Plug, category: 'network' },
  { kind: 'ingresses', label: 'Ingresses', icon: Globe, category: 'network' },
  // Storage
  { kind: 'persistentvolumes', label: 'PersistentVolumes', icon: HardDrive, category: 'storage' },
  { kind: 'persistentvolumeclaims', label: 'PersistentVolumeClaims', icon: Disc, category: 'storage' },
  // Cluster
  { kind: 'namespaces', label: 'Namespaces', icon: FolderOpen, category: 'cluster' },
  { kind: 'nodes', label: 'Nodes', icon: Server, category: 'cluster' },
  { kind: 'events', label: 'Events', icon: Newspaper, category: 'cluster' },
];

const categoryLabels: Record<string, string> = {
  workloads: 'Workloads',
  config: 'Config',
  network: 'Network',
  storage: 'Storage',
  cluster: 'Cluster',
  crd: 'Custom Resources',
};

interface SidebarProps {
  selectedResource: ResourceSelection;
  onSelectResource: (selection: ResourceSelection) => void;
  selectedNamespace: string | undefined;
  onSelectNamespace: (namespace: string | undefined) => void;
}

function isSelectedResource(selection: ResourceSelection, current: ResourceSelection): boolean {
  if (selection.type !== current.type) return false;
  if (selection.type === 'builtin' && current.type === 'builtin') {
    return selection.kind === current.kind;
  }
  if (selection.type === 'crd' && current.type === 'crd') {
    return selection.config.plural === current.config.plural &&
           selection.config.group === current.config.group;
  }
  return false;
}

export function Sidebar({
  selectedResource,
  onSelectResource,
  selectedNamespace,
  onSelectNamespace,
}: SidebarProps) {
  const { data: namespacesData } = useKubernetesQuery(() => getNamespaces(), []);
  const [crdConfigs, setCrdConfigs] = useState<CRDResourceConfig[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    workloads: true,
    config: true,
    network: true,
    storage: true,
    cluster: true,
    crd: true,
  });

  // Load CRDs
  useEffect(() => {
    getCRDs()
      .then((crds) => {
        const configs = crds.map(crdToResourceConfig);
        configs.sort((a, b) => a.kind.localeCompare(b.kind));
        setCrdConfigs(configs);
      })
      .catch((err) => {
        console.error('Failed to load CRDs:', err);
      });
  }, []);

  const toggleCategory = useCallback((category: string) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [category]: !prev[category],
    }));
  }, []);

  const namespaces = namespacesData?.items || [];
  const currentResourceConfig = getResourceConfigFromSelection(selectedResource);

  // Group built-in items by category
  const groupedBuiltIn = builtInNavItems.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, BuiltInNavItem[]>);

  // Group CRDs by API group
  const groupedCRDs = crdConfigs.reduce((acc, config) => {
    const groupKey = config.group;
    if (!acc[groupKey]) acc[groupKey] = [];
    acc[groupKey].push(config);
    return acc;
  }, {} as Record<string, CRDResourceConfig[]>);

  return (
    <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col fixed top-0 left-0 bottom-0">
      {/* Header */}
      <div className="shrink-0 h-16 px-5 flex items-center border-b border-gray-800">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-gray-100">
          <Hexagon size={24} className="text-gray-400" />
          Loop Dashboard
        </h1>
      </div>

      {/* Namespace Selector */}
      <div className="shrink-0 px-5 py-4 border-b border-gray-800">
        <NamespaceSelector
          namespaces={namespaces.map((ns) => ns.metadata.name)}
          selectedNamespace={selectedNamespace}
          onSelectNamespace={onSelectNamespace}
          disabled={!currentResourceConfig.namespaced}
        />
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 overflow-y-auto min-h-0">
        {/* Built-in resources */}
        {Object.entries(groupedBuiltIn).map(([category, items]) => (
          <div key={category} className="mb-2">
            <button
              className="flex items-center w-full px-5 py-2 text-xs uppercase tracking-wide text-gray-500 hover:text-gray-400 transition-colors"
              onClick={() => toggleCategory(category)}
            >
              <span className="mr-2">
                {expandedCategories[category] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
              <span>{categoryLabels[category]}</span>
            </button>
            {expandedCategories[category] && (
              <ul className="mt-1">
                {items.map((item) => {
                  const selection = builtinResource(item.kind);
                  const isActive = isSelectedResource(selection, selectedResource);
                  return (
                    <li key={item.kind}>
                      <button
                        className={`flex items-center w-full px-5 py-2.5 pl-9 text-sm transition-colors ${
                          isActive
                            ? 'bg-gray-800 text-gray-100 border-r-2 border-gray-400'
                            : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'
                        }`}
                        onClick={() => onSelectResource(selection)}
                      >
                        <item.icon size={16} className="mr-3 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ))}

        {/* CRDs */}
        {crdConfigs.length > 0 && (
          <div className="mb-2">
            <button
              className="flex items-center w-full px-5 py-2 text-xs uppercase tracking-wide text-gray-500 hover:text-gray-400 transition-colors"
              onClick={() => toggleCategory('crd')}
            >
              <span className="mr-2">
                {expandedCategories['crd'] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
              <span>{categoryLabels['crd']}</span>
              <span className="ml-auto px-2 py-0.5 bg-gray-800 rounded-full text-[10px] text-gray-500">
                {crdConfigs.length}
              </span>
            </button>
            {expandedCategories['crd'] && (
              <div className="mt-1">
                {Object.entries(groupedCRDs).map(([group, configs]) => (
                  <div key={group} className="mb-2">
                    <div className="px-5 pl-7 py-1 text-[10px] text-gray-600 truncate lowercase" title={group}>
                      {group}
                    </div>
                    <ul>
                      {configs.map((config) => {
                        const selection = crdResource(config);
                        const isActive = isSelectedResource(selection, selectedResource);
                        return (
                          <li key={`${config.group}/${config.plural}`}>
                            <button
                              className={`flex items-center w-full px-5 py-2.5 pl-11 text-sm transition-colors ${
                                isActive
                                  ? 'bg-gray-800 text-gray-100 border-r-2 border-gray-400'
                                  : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'
                              }`}
                              onClick={() => onSelectResource(selection)}
                              title={`${config.kind} (${config.group})`}
                            >
                              <Hexagon size={16} className="mr-3 shrink-0" />
                              <span className="truncate">{config.kind}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </nav>
    </aside>
  );
}
