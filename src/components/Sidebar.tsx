import { useState, useCallback } from 'react';
import { useKubernetesQuery } from '../hooks/useKubernetesQuery';
import { getNamespaces } from '../api/kubernetes';

export type ResourceType =
  | 'pods'
  | 'services'
  | 'deployments'
  | 'replicasets'
  | 'daemonsets'
  | 'statefulsets'
  | 'jobs'
  | 'cronjobs'
  | 'configmaps'
  | 'secrets'
  | 'ingresses'
  | 'namespaces'
  | 'nodes'
  | 'persistentvolumes'
  | 'persistentvolumeclaims'
  | 'events';

interface NavItem {
  type: ResourceType;
  label: string;
  icon: string;
  namespaced: boolean;
  category: 'workloads' | 'config' | 'network' | 'storage' | 'cluster';
}

const navItems: NavItem[] = [
  // Workloads
  { type: 'pods', label: 'Pods', icon: '🔲', namespaced: true, category: 'workloads' },
  { type: 'deployments', label: 'Deployments', icon: '🚀', namespaced: true, category: 'workloads' },
  { type: 'replicasets', label: 'ReplicaSets', icon: '📦', namespaced: true, category: 'workloads' },
  { type: 'daemonsets', label: 'DaemonSets', icon: '👹', namespaced: true, category: 'workloads' },
  { type: 'statefulsets', label: 'StatefulSets', icon: '📊', namespaced: true, category: 'workloads' },
  { type: 'jobs', label: 'Jobs', icon: '⚡', namespaced: true, category: 'workloads' },
  { type: 'cronjobs', label: 'CronJobs', icon: '⏰', namespaced: true, category: 'workloads' },
  // Config & Storage
  { type: 'configmaps', label: 'ConfigMaps', icon: '📄', namespaced: true, category: 'config' },
  { type: 'secrets', label: 'Secrets', icon: '🔐', namespaced: true, category: 'config' },
  // Network
  { type: 'services', label: 'Services', icon: '🔌', namespaced: true, category: 'network' },
  { type: 'ingresses', label: 'Ingresses', icon: '🌐', namespaced: true, category: 'network' },
  // Storage
  { type: 'persistentvolumes', label: 'PersistentVolumes', icon: '💾', namespaced: false, category: 'storage' },
  { type: 'persistentvolumeclaims', label: 'PersistentVolumeClaims', icon: '📀', namespaced: true, category: 'storage' },
  // Cluster
  { type: 'namespaces', label: 'Namespaces', icon: '📁', namespaced: false, category: 'cluster' },
  { type: 'nodes', label: 'Nodes', icon: '🖥️', namespaced: false, category: 'cluster' },
  { type: 'events', label: 'Events', icon: '📰', namespaced: true, category: 'cluster' },
];

const categoryLabels: Record<string, string> = {
  workloads: 'Workloads',
  config: 'Config',
  network: 'Network',
  storage: 'Storage',
  cluster: 'Cluster',
};

interface SidebarProps {
  selectedResource: ResourceType;
  onSelectResource: (type: ResourceType) => void;
  selectedNamespace: string | undefined;
  onSelectNamespace: (namespace: string | undefined) => void;
}

export function Sidebar({
  selectedResource,
  onSelectResource,
  selectedNamespace,
  onSelectNamespace,
}: SidebarProps) {
  const { data: namespacesData } = useKubernetesQuery(() => getNamespaces(), []);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    workloads: true,
    config: true,
    network: true,
    storage: true,
    cluster: true,
  });

  const toggleCategory = useCallback((category: string) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [category]: !prev[category],
    }));
  }, []);

  const namespaces = namespacesData?.items || [];
  const currentItem = navItems.find((item) => item.type === selectedResource);

  // Group items by category
  const groupedItems = navItems.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, NavItem[]>);

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h1>☸️ K8s Dashboard</h1>
      </div>

      <div className="namespace-selector">
        <label htmlFor="namespace-select">Namespace</label>
        <select
          id="namespace-select"
          value={selectedNamespace || ''}
          onChange={(e) => onSelectNamespace(e.target.value || undefined)}
          disabled={currentItem && !currentItem.namespaced}
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
        {Object.entries(groupedItems).map(([category, items]) => (
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
                {items.map((item) => (
                  <li key={item.type}>
                    <button
                      className={`nav-item ${
                        selectedResource === item.type ? 'active' : ''
                      }`}
                      onClick={() => onSelectResource(item.type)}
                    >
                      <span className="nav-icon">{item.icon}</span>
                      <span className="nav-label">{item.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </nav>
    </aside>
  );
}
