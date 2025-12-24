import { useState, useCallback, useEffect } from 'react';
import { useKubernetesQuery } from '../hooks/useKubernetesQuery';
import { getNamespaces } from '../api/kubernetes';
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
  icon: string;
  category: 'workloads' | 'config' | 'network' | 'storage' | 'cluster';
}

const builtInNavItems: BuiltInNavItem[] = [
  // Workloads
  { kind: 'pods', label: 'Pods', icon: '🔲', category: 'workloads' },
  { kind: 'deployments', label: 'Deployments', icon: '🚀', category: 'workloads' },
  { kind: 'replicasets', label: 'ReplicaSets', icon: '📦', category: 'workloads' },
  { kind: 'daemonsets', label: 'DaemonSets', icon: '👹', category: 'workloads' },
  { kind: 'statefulsets', label: 'StatefulSets', icon: '📊', category: 'workloads' },
  { kind: 'jobs', label: 'Jobs', icon: '⚡', category: 'workloads' },
  { kind: 'cronjobs', label: 'CronJobs', icon: '⏰', category: 'workloads' },
  // Config
  { kind: 'configmaps', label: 'ConfigMaps', icon: '📄', category: 'config' },
  { kind: 'secrets', label: 'Secrets', icon: '🔐', category: 'config' },
  // Network
  { kind: 'services', label: 'Services', icon: '🔌', category: 'network' },
  { kind: 'ingresses', label: 'Ingresses', icon: '🌐', category: 'network' },
  // Storage
  { kind: 'persistentvolumes', label: 'PersistentVolumes', icon: '💾', category: 'storage' },
  { kind: 'persistentvolumeclaims', label: 'PersistentVolumeClaims', icon: '📀', category: 'storage' },
  // Cluster
  { kind: 'namespaces', label: 'Namespaces', icon: '📁', category: 'cluster' },
  { kind: 'nodes', label: 'Nodes', icon: '🖥️', category: 'cluster' },
  { kind: 'events', label: 'Events', icon: '📰', category: 'cluster' },
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
        // Sort by kind name
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
    <aside className="sidebar">
      <div className="sidebar-header">
        <h1>☸️ Loop Dashboard</h1>
      </div>

      <div className="namespace-selector">
        <label htmlFor="namespace-select">Namespace</label>
        <select
          id="namespace-select"
          value={selectedNamespace || ''}
          onChange={(e) => onSelectNamespace(e.target.value || undefined)}
          disabled={!currentResourceConfig.namespaced}
        >
          <option value="">All Namespaces</option>
          {namespaces.map((ns) => (
            <option key={ns.metadata.uid} value={ns.metadata.name}>
              {ns.metadata.name}
            </option>
          ))}
        </select>
      </div>

      <nav className="sidebar-nav">
        {/* Built-in resources */}
        {Object.entries(groupedBuiltIn).map(([category, items]) => (
          <div key={category} className="nav-category">
            <button
              className="category-header"
              onClick={() => toggleCategory(category)}
            >
              <span className="category-chevron">
                {expandedCategories[category] ? '▼' : '▶'}
              </span>
              <span className="category-label">{categoryLabels[category]}</span>
            </button>
            {expandedCategories[category] && (
              <ul className="nav-list">
                {items.map((item) => {
                  const selection = builtinResource(item.kind);
                  return (
                    <li key={item.kind}>
                      <button
                        className={`nav-item ${isSelectedResource(selection, selectedResource) ? 'active' : ''}`}
                        onClick={() => onSelectResource(selection)}
                      >
                        <span className="nav-icon">{item.icon}</span>
                        <span className="nav-label">{item.label}</span>
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
          <div className="nav-category">
            <button
              className="category-header"
              onClick={() => toggleCategory('crd')}
            >
              <span className="category-chevron">
                {expandedCategories['crd'] ? '▼' : '▶'}
              </span>
              <span className="category-label">{categoryLabels['crd']}</span>
              <span className="category-count">{crdConfigs.length}</span>
            </button>
            {expandedCategories['crd'] && (
              <div className="crd-groups">
                {Object.entries(groupedCRDs).map(([group, configs]) => (
                  <div key={group} className="crd-group">
                    <div className="crd-group-header" title={group}>
                      {group}
                    </div>
                    <ul className="nav-list">
                      {configs.map((config) => {
                        const selection = crdResource(config);
                        return (
                          <li key={`${config.group}/${config.plural}`}>
                            <button
                              className={`nav-item ${isSelectedResource(selection, selectedResource) ? 'active' : ''}`}
                              onClick={() => onSelectResource(selection)}
                              title={`${config.kind} (${config.group})`}
                            >
                              <span className="nav-icon">🔷</span>
                              <span className="nav-label">{config.kind}</span>
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
