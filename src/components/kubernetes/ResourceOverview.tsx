import { useState, type ReactNode } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  AlertTriangle,
  Box,
  Boxes,
  ChevronRight,
  Clock,
  CloudOff,
  Database,
  Disc,
  FileText,
  Ghost,
  Globe,
  KeyRound,
  Layers,
  Plug,
  RefreshCw,
  Rocket,
  Search,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { fetchApi } from '../../api/kubernetes/kubernetes';
import { discoverResources } from '../../api/kubernetes/kubernetesDiscovery';
import { ResourcePanel } from './ResourcePanel';
import { ResourceSplit } from '../ResourceSplit';
import {
  attentionOrder,
  buildWorkloads,
  clusterSummary,
  groupByNamespace,
  kindLabel,
  matchesWorkload,
  needsAttention,
  overviewSources,
  podHealth,
  resourceKey,
  routeHosts,
  systemNamespaces,
  type HealthTone,
  type NamespaceGroup,
  type OverviewResource,
  type OverviewSource,
  type Workload,
  type WorkloadHealth,
} from './workloadOverview';

const refreshIntervals = { status: 15_000, topology: 60_000 };
const attentionLimit = 6;
const podLimit = 60;
const chipLimit = 5;
const cardGrid = 'grid grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))] gap-3';

const kindIcons: Record<string, LucideIcon> = {
  Deployment: Rocket,
  StatefulSet: Database,
  DaemonSet: Ghost,
  ReplicaSet: Layers,
  CronJob: Clock,
  Job: Zap,
  Pod: Box,
  Service: Plug,
  Ingress: Globe,
  HTTPRoute: Globe,
  PersistentVolumeClaim: Disc,
  ConfigMap: FileText,
  Secret: KeyRound,
};

const tones: Record<HealthTone, { text: string; badge: string; dot: string }> = {
  error: {
    text: 'text-red-600 dark:text-red-400',
    badge: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400',
    dot: 'bg-red-500',
  },
  warning: {
    text: 'text-amber-600 dark:text-amber-400',
    badge: 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-400',
    dot: 'bg-amber-400',
  },
  success: {
    text: 'text-emerald-600 dark:text-emerald-400',
    badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
    dot: 'bg-emerald-500',
  },
  neutral: {
    text: 'text-neutral-500 dark:text-neutral-400',
    badge: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
    dot: 'bg-neutral-300 dark:bg-neutral-600',
  },
};

async function listResources(
  context: string,
  source: OverviewSource,
  version: string,
  namespace: string | undefined,
): Promise<OverviewResource[] | null> {
  const base = source.group ? `/apis/${source.group}/${version}` : `/api/${version}`;
  const scope =
    namespace && !source.clusterScoped ? `/namespaces/${encodeURIComponent(namespace)}` : '';
  try {
    // resourceVersion=0 is served from the API server's watch cache instead of etcd.
    const data = await fetchApi<{ items: OverviewResource[] }>(
      `${base}${scope}/${source.plural}?resourceVersion=0`,
      context,
    );
    return data.items.map((item) => ({
      ...item,
      kind: source.kind,
      apiVersion: source.group ? `${source.group}/${version}` : version,
    }));
  } catch (error) {
    // Missing permissions for optional data just leave it out; null stops polling it.
    if (source.optional) return null;
    throw error;
  }
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function StatusBadge({ health }: { health: WorkloadHealth }) {
  return (
    <span
      title={health.detail || health.label}
      className={`inline-flex max-w-[60%] shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium leading-4 ${tones[health.tone].badge}`}
    >
      <span
        aria-hidden="true"
        className={`size-1.5 shrink-0 rounded-full ${tones[health.tone].dot}`}
      />
      <span className="truncate">{health.label}</span>
    </span>
  );
}

function PodStrip({
  pods,
  selectedKey,
  onSelect,
}: {
  pods: OverviewResource[];
  selectedKey?: string;
  onSelect: (resource: OverviewResource) => void;
}) {
  if (pods.length === 0) return null;
  return (
    <div className="relative z-10 mt-3 flex flex-wrap items-center gap-1">
      {pods.slice(0, podLimit).map((pod) => {
        const health = podHealth(pod);
        const selected = resourceKey(pod) === selectedKey;
        return (
          <button
            key={resourceKey(pod)}
            type="button"
            title={`${pod.metadata.name} · ${health.label}`}
            aria-label={`Open pod ${pod.metadata.name} (${health.label})`}
            onClick={() => onSelect(pod)}
            className={`size-3 rounded-[3px] transition-transform hover:scale-125 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500 ${tones[health.tone].dot} ${selected ? 'ring-2 ring-blue-500 ring-offset-1 ring-offset-white dark:ring-offset-neutral-900' : ''}`}
          />
        );
      })}
      {pods.length > podLimit && (
        <span className="ml-1 text-[11px] tabular-nums text-neutral-500">
          +{pods.length - podLimit}
        </span>
      )}
    </div>
  );
}

function RelatedChips({
  workload,
  selectedKey,
  onSelect,
}: {
  workload: Workload;
  selectedKey?: string;
  onSelect: (resource: OverviewResource) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const chips = [
    ...workload.routes.map((route) => {
      const hosts = routeHosts(route);
      return {
        resource: route,
        label: hosts[0] ?? route.metadata.name,
        suffix: hosts.length > 1 ? `+${hosts.length - 1}` : '',
        warning: false,
      };
    }),
    ...workload.services.map((service) => ({
      resource: service,
      label: service.metadata.name,
      suffix:
        service.spec?.clusterIP === 'None'
          ? 'headless'
          : (service.spec?.ports ?? []).map((port) => port.port).join(', '),
      warning: false,
    })),
    ...workload.claims.map((claim) => ({
      resource: claim,
      label: claim.metadata.name,
      suffix:
        claim.status?.phase === 'Bound'
          ? (claim.status.capacity?.storage ?? '')
          : (claim.status?.phase ?? ''),
      warning: claim.status?.phase !== 'Bound',
    })),
    ...workload.config.map((resource) => ({
      resource,
      label: resource.metadata.name,
      suffix: '',
      warning: false,
    })),
  ];
  if (chips.length === 0) return null;
  const visible = expanded ? chips : chips.slice(0, chipLimit);
  return (
    <div className="relative z-10 mt-auto pt-3">
      <ul className="flex flex-wrap gap-1.5 border-t border-neutral-100 pt-3 dark:border-neutral-800">
        {visible.map(({ resource, label, suffix, warning }) => {
          const Icon = kindIcons[resource.kind] ?? Box;
          const selected = resourceKey(resource) === selectedKey;
          return (
            <li key={resourceKey(resource)} className="min-w-0 max-w-full">
              <button
                type="button"
                title={`${resource.kind} ${resource.metadata.name}`}
                onClick={() => onSelect(resource)}
                className={`flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] leading-4 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 ${selected ? 'bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-200' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 hover:text-neutral-900 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700 dark:hover:text-neutral-100'}`}
              >
                <Icon size={12} aria-hidden="true" className="shrink-0 opacity-60" />
                <span className="truncate">{label}</span>
                {suffix && (
                  <span
                    className={`shrink-0 ${warning ? 'text-amber-600 dark:text-amber-400' : 'opacity-50'}`}
                  >
                    {suffix}
                  </span>
                )}
              </button>
            </li>
          );
        })}
        {chips.length > chipLimit && (
          <li>
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="rounded-md px-1.5 py-0.5 text-[11px] leading-4 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-blue-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
            >
              {expanded ? 'Show less' : `+${chips.length - chipLimit} more`}
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}

function WorkloadCard({
  workload,
  selectedKey,
  onSelect,
}: {
  workload: Workload;
  selectedKey?: string;
  onSelect: (resource: OverviewResource) => void;
}) {
  const { resource, health } = workload;
  const Icon = kindIcons[resource.kind] ?? Box;
  const selected = resourceKey(resource) === selectedKey;
  const facts = [
    kindLabel(resource),
    `${health.progress} ${health.progressLabel}`.trim(),
    workload.restarts > 0 ? plural(workload.restarts, 'restart') : '',
  ].filter(Boolean);
  return (
    <article
      className={`relative flex min-w-0 flex-col rounded-xl border bg-white p-3.5 transition-[border-color,box-shadow] dark:bg-neutral-900 ${selected ? 'border-blue-500 ring-1 ring-blue-500' : 'border-neutral-200 hover:border-neutral-300 hover:shadow-sm dark:border-neutral-800 dark:hover:border-neutral-700'}`}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
          <Icon size={16} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="min-w-0 flex-1 truncate text-sm font-medium leading-5">
              {/* The name stretches over the card so the whole card opens the workload. */}
              <button
                type="button"
                onClick={() => onSelect(resource)}
                title={resource.metadata.name}
                className="text-left after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-blue-500"
              >
                {resource.metadata.name}
              </button>
            </h4>
            <StatusBadge health={health} />
          </div>
          <p className="truncate text-xs leading-5 text-neutral-500">{facts.join(' · ')}</p>
        </div>
      </div>
      <PodStrip pods={workload.pods} selectedKey={selectedKey} onSelect={onSelect} />
      <RelatedChips workload={workload} selectedKey={selectedKey} onSelect={onSelect} />
    </article>
  );
}

function AttentionList({
  workloads,
  showNamespace,
  selectedKey,
  onSelect,
}: {
  workloads: Workload[];
  showNamespace: boolean;
  selectedKey?: string;
  onSelect: (resource: OverviewResource) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? workloads : workloads.slice(0, attentionLimit);
  return (
    <section
      aria-labelledby="overview-attention"
      className="overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
    >
      <h3
        id="overview-attention"
        className="flex items-center gap-2 border-b border-neutral-100 px-4 py-2.5 text-[13px] font-medium dark:border-neutral-800"
      >
        Needs attention
        <span className="rounded-full bg-red-50 px-1.5 text-[11px] tabular-nums text-red-700 dark:bg-red-500/10 dark:text-red-400">
          {workloads.length}
        </span>
      </h3>
      <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
        {visible.map(({ resource, health, restarts }) => {
          const Icon = health.tone === 'error' ? AlertCircle : AlertTriangle;
          const selected = resourceKey(resource) === selectedKey;
          return (
            <li key={resourceKey(resource)}>
              <button
                type="button"
                onClick={() => onSelect(resource)}
                className={`grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 px-4 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-500 ${selected ? 'bg-blue-50 dark:bg-blue-500/10' : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50'}`}
              >
                <Icon
                  size={16}
                  aria-hidden="true"
                  className={`mt-0.5 ${tones[health.tone].text}`}
                />
                <span className="min-w-0">
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="truncate text-sm font-medium">{resource.metadata.name}</span>
                    <span className="shrink-0 text-xs text-neutral-500">
                      {kindLabel(resource)}
                      {showNamespace && ` · ${resource.metadata.namespace}`}
                    </span>
                  </span>
                  <span
                    className="block truncate text-xs text-neutral-500"
                    title={health.detail || health.label}
                  >
                    {health.detail || health.label}
                  </span>
                </span>
                <span className="flex flex-col items-end gap-0.5 pt-0.5">
                  <span className={`text-xs font-medium ${tones[health.tone].text}`}>
                    {health.label}
                  </span>
                  {restarts > 0 && (
                    <span className="text-[11px] tabular-nums text-neutral-500">
                      {plural(restarts, 'restart')}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {workloads.length > attentionLimit && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="w-full border-t border-neutral-100 px-4 py-2 text-left text-xs text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-500 dark:border-neutral-800 dark:hover:bg-neutral-800/50 dark:hover:text-neutral-100"
        >
          {expanded ? 'Show fewer' : `Show all ${workloads.length}`}
        </button>
      )}
    </section>
  );
}

function NamespaceSection({
  group,
  collapsed,
  onToggle,
  children,
}: {
  group: NamespaceGroup;
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section aria-label={`Namespace ${group.namespace}`}>
      <h3 className="mb-3">
        <button
          type="button"
          aria-expanded={!collapsed}
          onClick={onToggle}
          className="-ml-1 flex items-center gap-2 rounded px-1 text-left focus-visible:outline-2 focus-visible:outline-blue-500"
        >
          <ChevronRight
            size={14}
            aria-hidden="true"
            className={`text-neutral-400 transition-transform ${collapsed ? '' : 'rotate-90'}`}
          />
          <span className="text-[13px] font-semibold text-neutral-800 dark:text-neutral-200">
            {group.namespace}
          </span>
          <span className="text-xs tabular-nums text-neutral-500">
            {plural(group.workloads.length, 'workload')}
          </span>
          {group.attention > 0 && (
            <span className="text-xs tabular-nums text-red-600 dark:text-red-400">
              {group.attention} need attention
            </span>
          )}
        </button>
      </h3>
      {!collapsed && children}
    </section>
  );
}

function Notice({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div role="status" className="flex flex-col items-center px-6 py-20 text-center">
      <span className="mb-4 grid size-11 place-items-center rounded-xl bg-neutral-100 text-neutral-400 dark:bg-neutral-900 dark:text-neutral-500">
        <Icon size={20} aria-hidden="true" />
      </span>
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 max-w-sm text-xs leading-5 text-neutral-500 [overflow-wrap:anywhere]">
        {children}
      </p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div role="status" aria-label="Loading workloads" className="animate-pulse space-y-3">
      <div className="h-4 w-40 rounded bg-neutral-200 dark:bg-neutral-800" />
      <div className={cardGrid}>
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            className="flex h-28 gap-3 rounded-xl border border-neutral-200 bg-white p-3.5 dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div className="size-8 rounded-lg bg-neutral-100 dark:bg-neutral-800" />
            <div className="flex-1 space-y-2 pt-1">
              <div className="h-3 w-2/3 rounded bg-neutral-100 dark:bg-neutral-800" />
              <div className="h-2.5 w-1/3 rounded bg-neutral-100 dark:bg-neutral-800" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ResourceOverview({
  context = '',
  namespace,
  isChatPanelOpen = false,
}: {
  context?: string;
  namespace?: string;
  isChatPanelOpen?: boolean;
}) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<OverviewResource | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [refreshing, setRefreshing] = useState(false);

  // Shares the navigation's cached discovery, so checking for optional APIs costs no requests.
  const { data: discovered } = useQuery({
    queryKey: ['kubernetes', 'navigation', context],
    queryFn: () => discoverResources(context),
    enabled: !!context,
  });
  const sources = overviewSources
    // Nodes are cluster-wide; a namespace view stays about that namespace.
    .filter((source) => !(namespace && source.clusterScoped))
    .map((source) => ({
      ...source,
      version: source.version ?? discovered?.get(`${source.plural}.${source.group}`)?.version,
    }));
  const queries = useQueries({
    queries: sources.map((source) => ({
      queryKey: ['kubernetes', 'resources', context, 'overview', namespace, source.kind],
      queryFn: () => listResources(context, source, source.version!, namespace),
      enabled: !!context && !!source.version,
      refetchInterval: (query: { state: { data: unknown } }) =>
        query.state.data === null ? false : refreshIntervals[source.refresh],
    })),
  });

  const resources = queries.flatMap((query) => query.data ?? []);
  const workloads = buildWorkloads(resources);
  const visible = workloads.filter((workload) => matchesWorkload(workload, search));
  const attention = visible.filter((workload) => needsAttention(workload.health));
  attention.sort(attentionOrder);
  const groups = groupByNamespace(visible);
  const summary = clusterSummary(resources);
  const failures = queries.flatMap((query, index) =>
    query.error ? [{ ...sources[index], error: query.error }] : [],
  );
  const settled = queries.every((query, index) => sources[index].optional || !query.isPending);
  const hasData = queries.some((query, index) => !sources[index].optional && query.data);
  const selectedKey = selected ? resourceKey(selected) : undefined;
  const refresh = async () => {
    setRefreshing(true);
    await Promise.allSettled(
      queries.filter((_, index) => sources[index].version).map((query) => query.refetch()),
    );
    setRefreshing(false);
  };
  const isCollapsed = (group: NamespaceGroup) =>
    collapsed[group.namespace] ??
    (systemNamespaces.has(group.namespace) && group.attention === 0 && !search.trim());

  let content: ReactNode;
  if (!settled) {
    content = <OverviewSkeleton />;
  } else if (!hasData && failures.length > 0) {
    content = (
      <Notice
        icon={CloudOff}
        title="Couldn’t load workloads"
        action={
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
          >
            {refreshing ? 'Retrying…' : 'Try again'}
          </button>
        }
      >
        {failures[0].error.message}
      </Notice>
    );
  } else if (workloads.length === 0) {
    content = (
      <Notice icon={Boxes} title="No workloads yet">
        Deployments, StatefulSets, DaemonSets, Jobs, CronJobs and standalone pods
        {namespace ? ` in ${namespace}` : ''} show up here.
      </Notice>
    );
  } else if (visible.length === 0) {
    content = (
      <Notice
        icon={Search}
        title={`Nothing matches “${search.trim()}”`}
        action={
          <button
            type="button"
            onClick={() => setSearch('')}
            className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            Clear filter
          </button>
        }
      >
        Search matches workload, pod, service, host, volume and config names, namespaces and
        statuses.
      </Notice>
    );
  } else {
    content = (
      <div className="space-y-7">
        {attention.length > 0 && (
          <AttentionList
            workloads={attention}
            showNamespace={!namespace}
            selectedKey={selectedKey}
            onSelect={setSelected}
          />
        )}
        {groups.map((group) => (
          <NamespaceSection
            key={group.namespace}
            group={group}
            collapsed={isCollapsed(group)}
            onToggle={() => setCollapsed({ ...collapsed, [group.namespace]: !isCollapsed(group) })}
          >
            <div className={cardGrid}>
              {group.workloads.map((workload) => (
                <WorkloadCard
                  key={resourceKey(workload.resource)}
                  workload={workload}
                  selectedKey={selectedKey}
                  onSelect={setSelected}
                />
              ))}
            </div>
          </NamespaceSection>
        ))}
      </div>
    );
  }

  return (
    <ResourceSplit
      overview
      isChatPanelOpen={isChatPanelOpen}
      details={
        selected ? (
          <ResourcePanel
            key={`${context}/${selectedKey}`}
            context={context}
            isOpen
            onClose={() => setSelected(null)}
            resource={{
              apiVersion: selected.apiVersion,
              kind: selected.kind,
              name: selected.metadata.name,
              namespace: selected.metadata.namespace,
              uid: selected.metadata.uid,
            }}
          />
        ) : undefined
      }
    >
      <section aria-label="Cluster overview" className="flex h-full min-w-0 flex-col">
        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 px-5 pb-4">
          <div className="relative min-w-0 max-w-xs flex-1 basis-56">
            <Search
              size={14}
              aria-hidden="true"
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400"
            />
            <input
              type="search"
              aria-label="Filter workloads"
              placeholder="Filter workloads…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => event.key === 'Escape' && setSearch('')}
              className="w-full rounded-lg border border-neutral-200 bg-white py-1.5 pl-8 pr-8 text-[13px] outline-none transition-colors placeholder:text-neutral-400 focus:border-blue-500 dark:border-neutral-800 dark:bg-neutral-900 [&::-webkit-search-cancel-button]:hidden"
            />
            {search && (
              <button
                type="button"
                aria-label="Clear filter"
                onClick={() => setSearch('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
              >
                <X size={14} />
              </button>
            )}
          </div>
          {settled && hasData && (
            <dl className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500">
              {[
                { label: 'Workloads', value: workloads.length, of: undefined, unit: 'workloads' },
                {
                  label: 'Pods ready',
                  value: summary.readyPods,
                  of: summary.pods,
                  unit: 'pods ready',
                },
                ...(summary.nodes
                  ? [
                      {
                        label: 'Nodes ready',
                        value: summary.readyNodes,
                        of: summary.nodes,
                        unit: 'nodes ready',
                      },
                    ]
                  : []),
              ].map((stat) => (
                <div key={stat.label} className="flex items-baseline gap-1">
                  <dt className="sr-only">{stat.label}</dt>
                  <dd className="tabular-nums">
                    <span
                      className={`font-medium ${stat.of !== undefined && stat.value < stat.of ? 'text-amber-600 dark:text-amber-400' : 'text-neutral-800 dark:text-neutral-200'}`}
                    >
                      {stat.value}
                    </span>
                    {stat.of !== undefined && `/${stat.of}`} {stat.unit}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <button
            type="button"
            aria-label="Refresh overview"
            title="Refresh"
            onClick={refresh}
            disabled={refreshing}
            className={`panel-icon-button shrink-0 p-1.5 disabled:opacity-50 ${settled && hasData ? '' : 'ml-auto'}`}
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-5 pb-8">
          {failures.length > 0 && hasData && (
            <div
              role="alert"
              className="mb-5 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
            >
              <AlertTriangle size={14} aria-hidden="true" className="mt-px shrink-0" />
              <p className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                <span className="font-medium">
                  Couldn’t load {failures.map((failure) => failure.label).join(', ')}.
                </span>{' '}
                The overview may be incomplete. {failures[0].error.message}
              </p>
              <button
                type="button"
                onClick={refresh}
                disabled={refreshing}
                className="shrink-0 font-medium underline underline-offset-2 disabled:opacity-50"
              >
                Retry
              </button>
            </div>
          )}
          {content}
        </div>
      </section>
    </ResourceSplit>
  );
}
