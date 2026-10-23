import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Hexagon, LayoutList } from 'lucide-react';
import { getCustomResourceDefinitions, crdToResourceConfig } from '../../api/kubernetes/kubernetes';
import { discoverResources } from '../../api/kubernetes/kubernetesDiscovery';
import { ScopeSelector } from './ScopeSelector';
import { type V1APIResource } from '../../api/kubernetes/kubernetesTable';
import { getConfig } from '../../config';
import { builtInResourceTypes, categoryLabels, type ResourceTypeConfig } from './resourceTypes';

// Compare two resources for equality (by name and group)
function isSameResource(a: V1APIResource, b: V1APIResource): boolean {
  return a.name === b.name && (a.group || '') === (b.group || '');
}

interface NavProps {
  context: string;
  namespace: string | undefined;
  namespaces: { metadata?: { name?: string } }[];
  selectedResource: V1APIResource | null;
  onSelectResource: (resource: V1APIResource | null) => void;
  onSelectNamespace: (namespace: string | undefined) => void;
  isOverviewSelected?: boolean;
  isWelcome?: boolean;
}

export function Nav({
  context,
  namespace,
  namespaces,
  selectedResource,
  onSelectResource,
  onSelectNamespace,
  isOverviewSelected,
  isWelcome,
}: NavProps) {
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    workloads: true,
    config: true,
    network: true,
    storage: true,
    access: true,
    cluster: true,
    crd: false,
  });

  const {
    data: builtInConfigs = new Map<string, V1APIResource>(),
    error,
    refetch,
  } = useQuery({
    queryKey: ['kubernetes', 'navigation', context],
    queryFn: () => discoverResources(context),
    enabled: !!context,
  });
  const { data: crdConfigs = [] } = useQuery({
    queryKey: ['kubernetes', 'crds', context],
    queryFn: async () => {
      const crds = await getCustomResourceDefinitions(context);
      return crds.map(crdToResourceConfig).sort((a, b) => a.kind.localeCompare(b.kind));
    },
    enabled: !!context,
    refetchInterval: 30000,
  });

  const toggleCategory = useCallback((category: string) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [category]: !prev[category],
    }));
  }, []);

  // Group built-in items by category
  const groupedBuiltIn = builtInResourceTypes.reduce(
    (acc, item) => {
      if (!acc[item.category]) acc[item.category] = [];
      acc[item.category].push(item);
      return acc;
    },
    {} as Record<string, ResourceTypeConfig[]>,
  );

  // Group CRDs by API group
  const groupedCRDs = crdConfigs.reduce(
    (acc, config) => {
      const groupKey = config.group || 'core';
      if (!acc[groupKey]) acc[groupKey] = [];
      acc[groupKey].push(config);
      return acc;
    },
    {} as Record<string, V1APIResource[]>,
  );

  // Sort CRD groups by reversed domain (e.g., pkg.crossplane.io -> io.crossplane.pkg)
  const sortedCRDGroups = Object.entries(groupedCRDs).sort(([a], [b]) => {
    const reverseA = a.split('.').reverse().join('.');
    const reverseB = b.split('.').reverse().join('.');
    return reverseA.localeCompare(reverseB);
  });

  return (
    <>
      {error && (
        <div role="alert" className="px-4 py-2 text-xs text-danger">
          Navigation unavailable: {error.message}
          <button onClick={() => void refetch()} className="ml-2 underline">
            Retry
          </button>
        </div>
      )}
      {/* Namespace Selector */}
      <div className="shrink-0 px-2 pb-2">
        <ScopeSelector
          namespaces={namespaces}
          selectedNamespace={namespace}
          onSelectNamespace={onSelectNamespace}
          disabled={selectedResource !== null && !selectedResource.namespaced}
          spaceLabels={getConfig().kubernetes?.tenancyLabels}
          platformNamespaces={getConfig().kubernetes?.platformNamespaces}
        />
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 px-2 pb-3">
        <button
          className="sidebar-item"
          aria-current={isOverviewSelected && !isWelcome ? 'page' : undefined}
          onClick={() => onSelectResource(null)}
        >
          <LayoutList size={16} />
          <span className="truncate">Overview</span>
        </button>

        {/* Built-in resources */}
        {Object.entries(groupedBuiltIn).map(([category, items]) => (
          <div key={category}>
            <SectionToggle
              label={categoryLabels[category]}
              expanded={!!expandedCategories[category]}
              onToggle={() => toggleCategory(category)}
            />
            {expandedCategories[category] && (
              <ul>
                {items.map((item) => {
                  const config = builtInConfigs.get(item.kind);
                  if (!config) return null;
                  const isActive =
                    selectedResource !== null && isSameResource(config, selectedResource);
                  return (
                    <li key={item.kind}>
                      <button
                        className="sidebar-item"
                        aria-current={isActive ? 'page' : undefined}
                        onClick={() => onSelectResource(config)}
                      >
                        <item.icon size={16} />
                        <span className="truncate" title={item.label}>
                          {item.label}
                        </span>
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
          <div>
            <SectionToggle
              label={categoryLabels['crd']}
              count={crdConfigs.length}
              expanded={!!expandedCategories['crd']}
              onToggle={() => toggleCategory('crd')}
            />
            {expandedCategories['crd'] &&
              sortedCRDGroups.map(([group, configs]) => (
                <div key={group}>
                  <div
                    className="truncate px-2.5 pt-2 pb-0.5 text-[11px] text-fg-dim"
                    title={group}
                  >
                    {group}
                  </div>
                  <ul>
                    {configs.map((config) => {
                      const isActive =
                        selectedResource !== null && isSameResource(config, selectedResource);
                      return (
                        <li key={`${config.group || ''}/${config.name}`}>
                          <button
                            className="sidebar-item"
                            aria-current={isActive ? 'page' : undefined}
                            onClick={() => onSelectResource(config)}
                            title={`${config.kind} (${config.group})`}
                          >
                            <Hexagon size={16} />
                            <span className="truncate" title={config.kind}>
                              {config.kind}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
          </div>
        )}
      </nav>
    </>
  );
}

// A sidebar section label that folds its items; the chevron shows on hover, as
// in Finder.
function SectionToggle({
  label,
  count,
  expanded,
  onToggle,
}: {
  label: string;
  count?: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button className="sidebar-section group" aria-expanded={expanded} onClick={onToggle}>
      <span className="truncate">{label}</span>
      {count !== undefined && <span className="font-normal tabular-nums">{count}</span>}
      <ChevronRight
        size={12}
        className={`ml-auto opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100 ${
          expanded ? 'rotate-90' : ''
        }`}
      />
    </button>
  );
}

// Alias for new router-based code
export { Nav as ClusterNav };
