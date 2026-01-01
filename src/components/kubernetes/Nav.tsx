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
  Network,
  ShieldCheck,
  FileCheck,
  AppWindow,
  LayoutGrid,
  type LucideIcon,
} from 'lucide-react';
import { getCustomResourceDefinitions, crdToResourceConfig } from '../../api/kubernetes/kubernetes';
import { getResourceConfig } from '../../api/kubernetes/kubernetesDiscovery';
import { ScopeSelector } from './ScopeSelector';
import { type V1APIResource } from '../../api/kubernetes/kubernetesTable';
import { getConfig } from '../../config';
import { useKubernetes } from '../../hooks/useContext';

// Compare two resources for equality (by name and group)
function isSameResource(a: V1APIResource, b: V1APIResource): boolean {
  return a.name === b.name && (a.group || '') === (b.group || '');
}

interface BuiltInNavItem {
  kind: string;
  label: string;
  icon: LucideIcon;
  category: 'workloads' | 'config' | 'network' | 'storage' | 'cluster';
}

const builtInNavItems: BuiltInNavItem[] = [
  // Workloads
  { kind: 'pods', label: 'Pods', icon: Box, category: 'workloads' },
  { kind: 'deployments', label: 'Deployments', icon: Rocket, category: 'workloads' },
  { kind: 'daemonsets', label: 'DaemonSets', icon: Ghost, category: 'workloads' },
  { kind: 'statefulsets', label: 'StatefulSets', icon: Database, category: 'workloads' },
  { kind: 'replicasets', label: 'ReplicaSets', icon: Layers, category: 'workloads' },
  { kind: 'jobs', label: 'Jobs', icon: Zap, category: 'workloads' },
  { kind: 'cronjobs', label: 'CronJobs', icon: Clock, category: 'workloads' },
  // Config
  { kind: 'secrets', label: 'Secrets', icon: KeyRound, category: 'config' },
  { kind: 'configmaps', label: 'ConfigMaps', icon: FileText, category: 'config' },
  { kind: 'applications', label: 'Applications', icon: AppWindow, category: 'config' },
  { kind: 'applicationsets', label: 'ApplicationSets', icon: LayoutGrid, category: 'config' },
  { kind: 'certificates', label: 'Certificates', icon: ShieldCheck, category: 'config' },
  { kind: 'certificaterequests', label: 'CertificateRequests', icon: FileCheck, category: 'config' },
  // Network
  { kind: 'services', label: 'Services', icon: Plug, category: 'network' },
  { kind: 'ingresses', label: 'Ingresses', icon: Globe, category: 'network' },
  { kind: 'gateways', label: 'Gateways', icon: Network, category: 'network' },
  { kind: 'httproutes', label: 'HTTPRoutes', icon: Globe, category: 'network' },
  { kind: 'grpcroutes', label: 'GRPCRoutes', icon: Globe, category: 'network' },
  { kind: 'tcproutes', label: 'TCPRoutes', icon: Network, category: 'network' },
  { kind: 'udproutes', label: 'UDPRoutes', icon: Network, category: 'network' },
  { kind: 'tlsroutes', label: 'TLSRoutes', icon: Network, category: 'network' },
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

interface NavProps {
  selectedResource: V1APIResource | null;
  onSelectResource: (resource: V1APIResource | null) => void;
  isOverviewSelected?: boolean;
}

export function Nav({
  selectedResource,
  onSelectResource,
  isOverviewSelected,
}: NavProps) {
  const { context, namespace, namespaces, setNamespace } = useKubernetes();
  const [builtInConfigs, setBuiltInConfigs] = useState<Map<string, V1APIResource>>(new Map());
  const [crdConfigs, setCrdConfigs] = useState<V1APIResource[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    workloads: true,
    config: true,
    network: true,
    storage: true,
    cluster: true,
    crd: false,
  });

  // Load built-in resource configs from discovery
  useEffect(() => {
    const loadBuiltInConfigs = async () => {
      const configs = new Map<string, V1APIResource>();
      for (const item of builtInNavItems) {
        const config = await getResourceConfig(context, item.kind);
        if (config) {
          configs.set(item.kind, config);
        }
      }
      setBuiltInConfigs(configs);
    };
    loadBuiltInConfigs();
  }, [context]);

  // Load CRDs
  useEffect(() => {
    getCustomResourceDefinitions(context)
      .then((crds) => {
        const configs = crds.map(crdToResourceConfig);
        configs.sort((a, b) => a.kind.localeCompare(b.kind));
        setCrdConfigs(configs);
      })
      .catch((err) => {
        console.error('Failed to load CRDs:', err);
      });
  }, [context]);

  const toggleCategory = useCallback((category: string) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [category]: !prev[category],
    }));
  }, []);

  // Group built-in items by category
  const groupedBuiltIn = builtInNavItems.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, BuiltInNavItem[]>);

  // Group CRDs by API group
  const groupedCRDs = crdConfigs.reduce((acc, config) => {
    const groupKey = config.group || 'core';
    if (!acc[groupKey]) acc[groupKey] = [];
    acc[groupKey].push(config);
    return acc;
  }, {} as Record<string, V1APIResource[]>);

  // Sort CRD groups by reversed domain (e.g., pkg.crossplane.io -> io.crossplane.pkg)
  const sortedCRDGroups = Object.entries(groupedCRDs).sort(([a], [b]) => {
    const reverseA = a.split('.').reverse().join('.');
    const reverseB = b.split('.').reverse().join('.');
    return reverseA.localeCompare(reverseB);
  });

  return (
    <>
      {/* Namespace Selector */}
      <div className="shrink-0 px-3 pb-2">
        <ScopeSelector
          namespaces={namespaces}
          selectedNamespace={namespace}
          onSelectNamespace={setNamespace}
          disabled={selectedResource !== null && !selectedResource.namespaced}
          spaceLabels={getConfig().kubernetes?.tenancyLabels}
          platformNamespaces={getConfig().kubernetes?.platformNamespaces}
        />
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-1 overflow-y-auto overflow-x-hidden min-h-0">
        {/* Overview */}
        <div className="mb-2 px-2">
          <button
            className={`flex items-center w-full px-3 py-2 text-sm rounded-lg transition-colors ${
              isOverviewSelected
                ? 'bg-white/90 text-neutral-900 shadow-sm dark:bg-neutral-800 dark:text-neutral-100'
                : 'text-neutral-600 hover:bg-white/50 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800/50 dark:hover:text-neutral-200'
            }`}
            onClick={() => onSelectResource(null)}
          >
            <Network size={16} className="mr-2.5 shrink-0 opacity-70" />
            <span className="font-medium">Overview</span>
          </button>
        </div>

        {/* Built-in resources */}
        {Object.entries(groupedBuiltIn).map(([category, items]) => (
          <div key={category} className="mb-1">
            <button
              className="flex items-center w-full px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 hover:text-neutral-700 dark:text-neutral-500 dark:hover:text-neutral-400 transition-colors"
              onClick={() => toggleCategory(category)}
            >
              <span className="mr-1.5 opacity-60">
                {expandedCategories[category] ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </span>
              <span>{categoryLabels[category]}</span>
            </button>
            {expandedCategories[category] && (
              <ul className="px-2">
                {items.map((item) => {
                  const config = builtInConfigs.get(item.kind);
                  if (!config) return null;
                  const isActive = selectedResource !== null && isSameResource(config, selectedResource);
                  return (
                    <li key={item.kind}>
                      <button
                        className={`flex items-center w-full px-3 py-2 text-sm rounded-lg transition-colors ${
                          isActive
                            ? 'bg-white/90 text-neutral-900 shadow-sm dark:bg-neutral-800 dark:text-neutral-100'
                            : 'text-neutral-600 hover:bg-white/50 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800/50 dark:hover:text-neutral-200'
                        }`}
                        onClick={() => onSelectResource(config)}
                      >
                        <item.icon size={16} className="mr-2.5 shrink-0 opacity-70" />
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
          <div className="mb-1">
            <button
              className="flex items-center w-full px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 hover:text-neutral-700 dark:text-neutral-500 dark:hover:text-neutral-400 transition-colors"
              onClick={() => toggleCategory('crd')}
            >
              <span className="mr-1.5 opacity-60">
                {expandedCategories['crd'] ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </span>
              <span>{categoryLabels['crd']}</span>
              <span className="ml-auto px-1.5 py-0.5 bg-neutral-300/60 rounded text-[10px] text-neutral-500 dark:bg-neutral-700 dark:text-neutral-500">
                {crdConfigs.length}
              </span>
            </button>
            {expandedCategories['crd'] && (
              <div className="px-2">
                {sortedCRDGroups.map(([group, configs]) => (
                  <div key={group} className="mb-1">
                    <div className="px-3 py-1 text-[10px] text-neutral-400 truncate lowercase dark:text-neutral-600" title={group}>
                      {group}
                    </div>
                    <ul>
                      {configs.map((config) => {
                        const isActive = selectedResource !== null && isSameResource(config, selectedResource);
                        return (
                          <li key={`${config.group || ''}/${config.name}`}>
                            <button
                              className={`flex items-center w-full px-3 py-2 text-sm rounded-lg transition-colors ${
                                isActive
                                  ? 'bg-white/90 text-neutral-900 shadow-sm dark:bg-neutral-800 dark:text-neutral-100'
                                  : 'text-neutral-600 hover:bg-white/50 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800/50 dark:hover:text-neutral-200'
                              }`}
                              onClick={() => onSelectResource(config)}
                              title={`${config.kind} (${config.group})`}
                            >
                              <Hexagon size={16} className="mr-2.5 shrink-0 opacity-70" />
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
    </>
  );
}
