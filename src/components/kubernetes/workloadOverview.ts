import type {
  V1ContainerStatus,
  V1ObjectMeta,
  V1PodSpec,
  V1PodTemplateSpec,
} from '@kubernetes/client-node';

interface RouteRule {
  host?: string;
  http?: { paths?: { backend?: { service?: { name?: string } } }[] };
  backendRefs?: { name?: string; kind?: string; group?: string; namespace?: string }[];
}

export interface OverviewResource {
  apiVersion: string;
  kind: string;
  metadata: V1ObjectMeta & { name: string };
  spec?: {
    replicas?: number;
    suspend?: boolean;
    paused?: boolean;
    completions?: number;
    schedule?: string;
    selector?: Record<string, unknown>;
    template?: V1PodTemplateSpec;
    jobTemplate?: { spec?: { template?: V1PodTemplateSpec } };
    containers?: V1PodSpec['containers'];
    initContainers?: V1PodSpec['initContainers'];
    volumes?: V1PodSpec['volumes'];
    clusterIP?: string;
    ports?: { port: number; name?: string }[];
    rules?: RouteRule[];
    hostnames?: string[];
    defaultBackend?: { service?: { name?: string } };
    resources?: { requests?: Record<string, string> };
  };
  status?: {
    phase?: string;
    reason?: string;
    message?: string;
    readyReplicas?: number;
    updatedReplicas?: number;
    desiredNumberScheduled?: number;
    numberReady?: number;
    observedGeneration?: number;
    // A count on Jobs, a list of job references on CronJobs.
    active?: number | unknown[];
    succeeded?: number;
    failed?: number;
    lastScheduleTime?: string;
    capacity?: Record<string, string>;
    containerStatuses?: V1ContainerStatus[];
    initContainerStatuses?: V1ContainerStatus[];
    conditions?: { type: string; status: string; reason?: string; message?: string }[];
  };
}

export type HealthTone = 'error' | 'warning' | 'success' | 'neutral';
export interface WorkloadHealth {
  tone: HealthTone;
  label: string;
  detail?: string;
  progress: string;
  progressLabel: string;
}

export interface Workload {
  resource: OverviewResource;
  health: WorkloadHealth;
  pods: OverviewResource[];
  services: OverviewResource[];
  routes: OverviewResource[];
  claims: OverviewResource[];
  config: OverviewResource[];
  restarts: number;
}

export interface OverviewSource {
  kind: string;
  plural: string;
  group: string;
  // Omitted for APIs that may not be installed; the served version comes from discovery.
  version?: string;
  label: string;
  // Status changes need prompt updates; topology rarely changes.
  refresh: 'status' | 'topology';
  // Optional sources only enrich the overview and never block or fail it.
  optional?: boolean;
  clusterScoped?: boolean;
}

// ReplicaSets are deliberately absent: pods are linked to their Deployment by
// the controller's naming convention, which avoids the largest list in most clusters.
export const overviewSources: OverviewSource[] = [
  { kind: 'Pod', plural: 'pods', group: '', version: 'v1', label: 'Pods', refresh: 'status' },
  {
    kind: 'Deployment',
    plural: 'deployments',
    group: 'apps',
    version: 'v1',
    label: 'Deployments',
    refresh: 'status',
  },
  {
    kind: 'StatefulSet',
    plural: 'statefulsets',
    group: 'apps',
    version: 'v1',
    label: 'StatefulSets',
    refresh: 'status',
  },
  {
    kind: 'DaemonSet',
    plural: 'daemonsets',
    group: 'apps',
    version: 'v1',
    label: 'DaemonSets',
    refresh: 'status',
  },
  { kind: 'Job', plural: 'jobs', group: 'batch', version: 'v1', label: 'Jobs', refresh: 'status' },
  {
    kind: 'CronJob',
    plural: 'cronjobs',
    group: 'batch',
    version: 'v1',
    label: 'CronJobs',
    refresh: 'status',
  },
  {
    kind: 'Service',
    plural: 'services',
    group: '',
    version: 'v1',
    label: 'Services',
    refresh: 'topology',
  },
  {
    kind: 'PersistentVolumeClaim',
    plural: 'persistentvolumeclaims',
    group: '',
    version: 'v1',
    label: 'PersistentVolumeClaims',
    refresh: 'topology',
  },
  {
    kind: 'Ingress',
    plural: 'ingresses',
    group: 'networking.k8s.io',
    version: 'v1',
    label: 'Ingresses',
    refresh: 'topology',
  },
  {
    kind: 'HTTPRoute',
    plural: 'httproutes',
    group: 'gateway.networking.k8s.io',
    label: 'HTTPRoutes',
    refresh: 'topology',
    optional: true,
  },
  {
    kind: 'Node',
    plural: 'nodes',
    group: '',
    version: 'v1',
    label: 'Nodes',
    refresh: 'topology',
    optional: true,
    clusterScoped: true,
  },
];

const workloadKinds = new Set([
  'Deployment',
  'StatefulSet',
  'DaemonSet',
  'CronJob',
  'Job',
  'ReplicaSet',
  'Pod',
]);
const toneOrder: Record<HealthTone, number> = { error: 0, warning: 1, neutral: 2, success: 3 };
export const systemNamespaces = new Set(['kube-system', 'kube-public', 'kube-node-lease']);

export function resourceKey(resource: OverviewResource): string {
  return (
    resource.metadata.uid ??
    `${resource.apiVersion}/${resource.kind}/${resource.metadata.namespace}/${resource.metadata.name}`
  );
}

export function needsAttention(health: WorkloadHealth): boolean {
  return health.tone === 'error' || health.tone === 'warning';
}

export function kindLabel(resource: OverviewResource): string {
  return resource.kind === 'Pod' &&
    resource.metadata.ownerReferences?.some((owner) => owner.kind === 'Node')
    ? 'Static pod'
    : resource.kind;
}

function isReady(resource: OverviewResource): boolean {
  return !!resource.status?.conditions?.some(
    (condition) => condition.type === 'Ready' && condition.status === 'True',
  );
}

function isFinished(pod: OverviewResource): boolean {
  return ['Failed', 'Succeeded'].includes(pod.status?.phase ?? '');
}

// New pods and jobs pass through pending and not-ready states on their way up.
const startupGrace = 2 * 60_000;
function isStarting(resource: OverviewResource, now: number): boolean {
  return now - Date.parse(String(resource.metadata.creationTimestamp ?? '')) < startupGrace;
}

export function podHealth(pod: OverviewResource, now = Date.now()): WorkloadHealth {
  const health = assessPod(pod);
  // Startup states only need attention once they outlast the grace period; errors always do.
  return health.tone === 'warning' && health.label !== 'Unschedulable' && isStarting(pod, now)
    ? { ...health, tone: 'neutral' }
    : health;
}

function assessPod(pod: OverviewResource): WorkloadHealth {
  const status = pod.status;
  const containers = status?.containerStatuses ?? [];
  const ready = containers.filter((container) => container.ready).length;
  const total = pod.spec?.containers?.length ?? containers.length;
  const progress = total ? `${ready}/${total}` : '—';
  const base = { progress, progressLabel: 'ready' };
  if (pod.metadata.deletionTimestamp) return { ...base, tone: 'neutral', label: 'Terminating' };
  if (status?.phase === 'Succeeded') return { ...base, tone: 'success', label: 'Completed' };
  if (status?.phase === 'Failed')
    return { ...base, tone: 'error', label: status.reason || 'Failed', detail: status.message };

  const problems: WorkloadHealth[] = [];
  for (const container of [...(status?.initContainerStatuses ?? []), ...containers]) {
    const waiting = container.state?.waiting;
    const terminated = container.state?.terminated;
    const exit = terminated ?? container.lastState?.terminated;
    // A restarting container alternates between Error and CrashLoopBackOff on every poll;
    // report it consistently, explained by how it last exited.
    if (
      (container.restartCount ?? 0) > 0 &&
      exit &&
      exit.exitCode !== 0 &&
      (waiting?.reason === 'CrashLoopBackOff' || terminated)
    ) {
      const reason = exit.reason && exit.reason !== 'Error' ? ` (${exit.reason})` : '';
      problems.push({
        ...base,
        tone: 'error',
        label: 'CrashLoopBackOff',
        detail: `${container.name}: ${exit.message?.trim() || `exited with code ${exit.exitCode}${reason}`}`,
      });
    } else if (waiting?.reason) {
      problems.push({
        ...base,
        tone: /backoff|error|invalid|failed|crash/i.test(waiting.reason) ? 'error' : 'warning',
        label: waiting.reason,
        detail: `${container.name}: ${waiting.message || waiting.reason}`,
      });
    } else if (terminated && terminated.exitCode !== 0) {
      problems.push({
        ...base,
        tone: 'error',
        label: terminated.reason || `Exit ${terminated.exitCode}`,
        detail: `${container.name}: ${terminated.message || `exited with code ${terminated.exitCode}`}`,
      });
    }
  }
  problems.sort((a, b) => toneOrder[a.tone] - toneOrder[b.tone]);
  if (problems[0]) return problems[0];
  const unscheduled = status?.conditions?.find(
    (condition) => condition.type === 'PodScheduled' && condition.status === 'False',
  );
  if (unscheduled)
    return {
      ...base,
      tone: 'warning',
      label: unscheduled.reason || 'Pending',
      detail: unscheduled.message,
    };
  if (status?.phase === 'Running' && isReady(pod)) {
    return { ...base, tone: 'success', label: 'Ready' };
  }
  return {
    ...base,
    tone: 'warning',
    label: status?.phase === 'Running' ? 'Not ready' : status?.phase || 'Status unknown',
    detail: status?.message,
  };
}

function cronJobHealth(
  cronJob: OverviewResource,
  pods: OverviewResource[],
  jobs: OverviewResource[],
  now: number,
): WorkloadHealth {
  const base = { progress: cronJob.spec?.schedule ?? '', progressLabel: '' };
  if (cronJob.metadata.deletionTimestamp) return { ...base, tone: 'neutral', label: 'Terminating' };
  const latest = [...jobs].sort(
    (a, b) =>
      new Date(String(b.metadata.creationTimestamp ?? 0)).getTime() -
      new Date(String(a.metadata.creationTimestamp ?? 0)).getTime(),
  )[0];
  // Older runs stay in the job history; only the latest one reflects the current state.
  const last =
    latest &&
    workloadHealth(
      latest,
      pods.filter((pod) =>
        pod.metadata.ownerReferences?.some((owner) => owner.uid === latest.metadata.uid),
      ),
      [],
      now,
    );
  if (last && needsAttention(last))
    return {
      ...base,
      tone: last.tone,
      label: last.tone === 'error' ? 'Last run failed' : last.label,
      detail: `${latest.metadata.name}: ${last.detail || last.label}`,
    };
  if (cronJob.spec?.suspend) return { ...base, tone: 'neutral', label: 'Suspended' };
  if (last?.label === 'Running') return { ...base, tone: 'neutral', label: 'Running' };
  if (!last && !cronJob.status?.lastScheduleTime)
    return { ...base, tone: 'neutral', label: 'Not run yet' };
  return { ...base, tone: 'success', label: 'Scheduled' };
}

export function workloadHealth(
  resource: OverviewResource,
  pods: OverviewResource[],
  jobs: OverviewResource[] = [],
  now = Date.now(),
): WorkloadHealth {
  if (resource.kind === 'Pod') return podHealth(resource, now);
  if (resource.kind === 'CronJob') return cronJobHealth(resource, pods, jobs, now);
  const spec = resource.spec;
  const status = resource.status;
  const isJob = resource.kind === 'Job';
  const desired = isJob
    ? (spec?.completions ?? 1)
    : resource.kind === 'DaemonSet'
      ? status?.desiredNumberScheduled
      : (spec?.replicas ?? 1);
  const ready = isJob
    ? (status?.succeeded ?? 0)
    : resource.kind === 'DaemonSet'
      ? (status?.numberReady ?? 0)
      : (status?.readyReplicas ?? 0);
  const base = {
    progress:
      isJob && spec?.completions === undefined
        ? String(ready)
        : desired === undefined
          ? '—'
          : `${ready}/${desired}`,
    progressLabel: isJob ? 'completed' : 'ready',
  };
  if (resource.metadata.deletionTimestamp)
    return { ...base, tone: 'neutral', label: 'Terminating' };
  if (
    isJob &&
    status?.conditions?.some(
      (condition) => condition.type === 'Complete' && condition.status === 'True',
    )
  ) {
    return { ...base, tone: 'success', label: 'Completed' };
  }
  if (isJob && spec?.suspend) return { ...base, tone: 'neutral', label: 'Suspended' };
  if (!isJob && desired === 0)
    return {
      progress: '',
      progressLabel: '',
      tone: 'neutral',
      label: resource.kind === 'DaemonSet' ? 'No scheduled pods' : 'Scaled to zero',
    };

  const failure = status?.conditions?.find(
    (condition) =>
      (['Failed', 'FailureTarget', 'ReplicaFailure'].includes(condition.type) &&
        condition.status === 'True') ||
      (condition.type === 'Progressing' && condition.status === 'False'),
  );
  // Finished Job attempts remain in the API while a replacement pod is running.
  const activePods = isJob ? pods.filter((pod) => !isFinished(pod)) : pods;
  const problem = activePods
    .map((pod) => podHealth(pod, now))
    .filter(needsAttention)
    .sort((a, b) => toneOrder[a.tone] - toneOrder[b.tone])[0];
  // A pod's own problem (e.g. an image pull failure) explains a stalled rollout better
  // than the rollout condition, which only raises the severity.
  if (problem) return { ...problem, ...base, tone: failure ? 'error' : problem.tone };
  if (failure)
    return { ...base, tone: 'error', label: failure.reason || 'Failed', detail: failure.message };
  if (!status || desired === undefined)
    return { ...base, tone: 'warning', label: 'Status unknown' };
  const starting = isStarting(resource, now) || activePods.some((pod) => isStarting(pod, now));
  if (isJob) {
    if (status.active) return { ...base, tone: 'neutral', label: 'Running' };
    if (status.failed) return { ...base, tone: 'warning', label: 'Retrying' };
    return { ...base, tone: starting ? 'neutral' : 'warning', label: 'Pending' };
  }
  // Rollouts that stall are reported by the Progressing condition above.
  const rollingOut =
    (resource.metadata.generation !== undefined &&
      status.observedGeneration !== undefined &&
      status.observedGeneration < resource.metadata.generation) ||
    (resource.kind === 'Deployment' &&
      status.updatedReplicas !== undefined &&
      status.updatedReplicas < desired);
  if (rollingOut) return { ...base, tone: 'neutral', label: spec?.paused ? 'Paused' : 'Updating' };
  if (ready < desired)
    return starting
      ? { ...base, tone: 'neutral', label: 'Starting' }
      : {
          ...base,
          tone: 'warning',
          label: `${desired - ready} ${desired - ready === 1 ? 'pod' : 'pods'} not ready`,
        };
  const unavailable = status.conditions?.find(
    (condition) => condition.type === 'Available' && condition.status === 'False',
  );
  if (unavailable)
    return {
      ...base,
      tone: 'warning',
      label: unavailable.reason || 'Unavailable',
      detail: unavailable.message,
    };
  if (spec?.paused) return { ...base, tone: 'neutral', label: 'Paused' };
  return { ...base, tone: 'success', label: 'Ready' };
}

function byName(a: OverviewResource, b: OverviewResource): number {
  return (
    (a.metadata.namespace ?? '').localeCompare(b.metadata.namespace ?? '') ||
    a.metadata.name.localeCompare(b.metadata.name) ||
    a.kind.localeCompare(b.kind)
  );
}

export function attentionOrder(a: Workload, b: Workload): number {
  return toneOrder[a.health.tone] - toneOrder[b.health.tone] || byName(a.resource, b.resource);
}

function podTemplate(resource: OverviewResource): V1PodTemplateSpec | undefined {
  if (resource.kind === 'Pod')
    return { metadata: resource.metadata, spec: resource.spec as V1PodSpec | undefined };
  if (resource.kind === 'CronJob') return resource.spec?.jobTemplate?.spec?.template;
  return resource.spec?.template;
}

function selects(selector: Record<string, unknown> | undefined, labels: Record<string, string>) {
  const entries = Object.entries(selector ?? {});
  return entries.length > 0 && entries.every(([key, value]) => labels[key] === value);
}

// ConfigMaps and Secrets are read from the pod template, so they need no extra requests.
function configReferences(resource: OverviewResource): OverviewResource[] {
  const spec = podTemplate(resource)?.spec;
  const names = { ConfigMap: new Set<string>(), Secret: new Set<string>() };
  for (const container of [...(spec?.initContainers ?? []), ...(spec?.containers ?? [])]) {
    for (const source of container.envFrom ?? []) {
      if (source.configMapRef?.name) names.ConfigMap.add(source.configMapRef.name);
      if (source.secretRef?.name) names.Secret.add(source.secretRef.name);
    }
    for (const variable of container.env ?? []) {
      const from = variable.valueFrom;
      if (from?.configMapKeyRef?.name) names.ConfigMap.add(from.configMapKeyRef.name);
      if (from?.secretKeyRef?.name) names.Secret.add(from.secretKeyRef.name);
    }
  }
  for (const volume of spec?.volumes ?? []) {
    if (volume.configMap?.name) names.ConfigMap.add(volume.configMap.name);
    if (volume.secret?.secretName) names.Secret.add(volume.secret.secretName);
    for (const source of volume.projected?.sources ?? []) {
      if (source.configMap?.name) names.ConfigMap.add(source.configMap.name);
      if (source.secret?.name) names.Secret.add(source.secret.name);
    }
  }
  // Every service account token volume projects the cluster CA bundle.
  names.ConfigMap.delete('kube-root-ca.crt');
  return (['ConfigMap', 'Secret'] as const).flatMap((kind) =>
    [...names[kind]].sort().map((name) => ({
      apiVersion: 'v1',
      kind,
      metadata: { name, namespace: resource.metadata.namespace },
    })),
  );
}

function routeBackends(route: OverviewResource): string[] {
  const namespace = route.metadata.namespace;
  const rules = route.spec?.rules ?? [];
  const names =
    route.kind === 'Ingress'
      ? [
          route.spec?.defaultBackend?.service?.name,
          ...rules.flatMap((rule) => rule.http?.paths?.map((path) => path.backend?.service?.name)),
        ].map((name) => name && `${namespace}/${name}`)
      : rules.flatMap((rule) =>
          (rule.backendRefs ?? [])
            .filter((ref) => (ref.kind ?? 'Service') === 'Service' && !ref.group)
            .map((ref) => ref.name && `${ref.namespace ?? namespace}/${ref.name}`),
        );
  return names.filter((name): name is string => !!name);
}

export function routeHosts(route: OverviewResource): string[] {
  const hosts =
    route.kind === 'Ingress'
      ? (route.spec?.rules ?? []).flatMap((rule) => (rule.host ? [rule.host] : []))
      : (route.spec?.hostnames ?? []);
  return [...new Set(hosts)];
}

export function buildWorkloads(resources: OverviewResource[], now = Date.now()): Workload[] {
  const byUid = new Map(
    resources
      .filter((resource) => resource.metadata.uid)
      .map((resource) => [resource.metadata.uid!, resource]),
  );
  const deployments = new Map(
    resources
      .filter((resource) => resource.kind === 'Deployment')
      .map((resource) => [`${resource.metadata.namespace}/${resource.metadata.name}`, resource]),
  );
  // Stand-ins for ReplicaSets that are not owned by a known Deployment.
  const replicaSets = new Map<string, OverviewResource>();
  const parentOf = (resource: OverviewResource): OverviewResource | undefined => {
    const owner = resource.metadata.ownerReferences?.find((reference) => reference.controller);
    if (!owner) return undefined;
    const known = byUid.get(owner.uid);
    if (known || owner.kind !== 'ReplicaSet') return known;
    const labels = resource.metadata.labels ?? {};
    const hash = labels['pod-template-hash'];
    // The deployment controller names its ReplicaSets <deployment>-<pod-template-hash>.
    if (hash && owner.name.endsWith(`-${hash}`)) {
      const deployment = deployments.get(
        `${resource.metadata.namespace}/${owner.name.slice(0, -hash.length - 1)}`,
      );
      const matchLabels = deployment?.spec?.selector?.matchLabels as
        | Record<string, unknown>
        | undefined;
      if (deployment && selects(matchLabels, labels)) return deployment;
    }
    const replicaSet = replicaSets.get(owner.uid) ?? {
      apiVersion: owner.apiVersion,
      kind: 'ReplicaSet',
      metadata: { name: owner.name, namespace: resource.metadata.namespace, uid: owner.uid },
    };
    replicaSets.set(owner.uid, replicaSet);
    return replicaSet;
  };
  const rootOf = (resource: OverviewResource): OverviewResource => {
    const seen = new Set<string>();
    let root = resource;
    while (!seen.has(resourceKey(root))) {
      seen.add(resourceKey(root));
      const parent = parentOf(root);
      if (
        !parent ||
        !workloadKinds.has(parent.kind) ||
        parent.metadata.namespace !== resource.metadata.namespace ||
        seen.has(resourceKey(parent))
      )
        break;
      root = parent;
    }
    return root;
  };

  const roots = new Map<string, OverviewResource>();
  const members = new Map<string, OverviewResource[]>();
  for (const resource of resources) {
    if (!workloadKinds.has(resource.kind)) continue;
    const root = rootOf(resource);
    const key = resourceKey(root);
    roots.set(key, root);
    if (resource.kind === 'Pod' || resource.kind === 'Job')
      members.set(key, [...(members.get(key) ?? []), resource]);
  }
  const services = resources.filter((resource) => resource.kind === 'Service');
  const claims = resources.filter((resource) => resource.kind === 'PersistentVolumeClaim');
  const routes = resources
    .filter((resource) => resource.kind === 'Ingress' || resource.kind === 'HTTPRoute')
    .map((route) => ({ route, backends: new Set(routeBackends(route)) }));
  return [...roots.values()]
    .map((root): Workload => {
      const key = resourceKey(root);
      const related = members.get(key) ?? [];
      const pods = related.filter((member) => member.kind === 'Pod').sort(byName);
      const jobs = related.filter((member) => member.kind === 'Job' && member !== root);
      const namespace = root.metadata.namespace;
      // A stand-in ReplicaSet has no status of its own, so its pods describe it.
      const resource = replicaSets.has(root.metadata.uid ?? '')
        ? {
            ...root,
            spec: { replicas: pods.filter((pod) => !isFinished(pod)).length },
            status: { readyReplicas: pods.filter(isReady).length },
          }
        : root;
      const labels = [
        ...pods.map((pod) => pod.metadata.labels),
        podTemplate(resource)?.metadata?.labels,
      ].filter((value) => value !== undefined);
      const relatedServices = services.filter(
        (service) =>
          service.metadata.namespace === namespace &&
          labels.some((podLabels) => selects(service.spec?.selector, podLabels)),
      );
      const serviceNames = new Set(
        relatedServices.map((service) => `${namespace}/${service.metadata.name}`),
      );
      const claimNames = new Set(
        [
          ...pods.flatMap((pod) => pod.spec?.volumes ?? []),
          ...(podTemplate(resource)?.spec?.volumes ?? []),
        ].flatMap((volume) =>
          volume.persistentVolumeClaim ? [volume.persistentVolumeClaim.claimName] : [],
        ),
      );
      return {
        resource,
        health: workloadHealth(resource, pods, jobs, now),
        pods: pods.filter((pod) => resourceKey(pod) !== key),
        services: relatedServices.sort(byName),
        routes: routes
          .filter(({ backends }) => [...serviceNames].some((name) => backends.has(name)))
          .map(({ route }) => route)
          .sort(byName),
        claims: claims
          .filter(
            (claim) =>
              claim.metadata.namespace === namespace &&
              (claimNames.has(claim.metadata.name) ||
                claim.metadata.ownerReferences?.some((owner) => owner.uid === root.metadata.uid)),
          )
          .sort(byName),
        config: configReferences(resource),
        restarts: pods
          .filter((pod) => !isFinished(pod))
          .flatMap((pod) => pod.status?.containerStatuses ?? [])
          .reduce((sum, container) => sum + (container.restartCount ?? 0), 0),
      };
    })
    .sort((a, b) => byName(a.resource, b.resource));
}

export interface NamespaceGroup {
  namespace: string;
  workloads: Workload[];
  attention: number;
}

export function groupByNamespace(workloads: Workload[]): NamespaceGroup[] {
  const groups = new Map<string, Workload[]>();
  for (const workload of workloads) {
    const namespace = workload.resource.metadata.namespace ?? '';
    groups.set(namespace, [...(groups.get(namespace) ?? []), workload]);
  }
  return [...groups]
    .map(([namespace, items]) => ({
      namespace,
      workloads: items,
      attention: items.filter((workload) => needsAttention(workload.health)).length,
    }))
    .sort(
      (a, b) =>
        Number(systemNamespaces.has(a.namespace)) - Number(systemNamespaces.has(b.namespace)) ||
        a.namespace.localeCompare(b.namespace),
    );
}

export function clusterSummary(resources: OverviewResource[]) {
  const pods = resources.filter((resource) => resource.kind === 'Pod' && !isFinished(resource));
  const nodes = resources.filter((resource) => resource.kind === 'Node');
  return {
    pods: pods.length,
    readyPods: pods.filter(isReady).length,
    nodes: nodes.length,
    readyNodes: nodes.filter(isReady).length,
  };
}

export function matchesWorkload(workload: Workload, search: string): boolean {
  const related = [
    workload.resource,
    ...workload.pods,
    ...workload.services,
    ...workload.routes,
    ...workload.claims,
    ...workload.config,
  ];
  const text = [
    ...related.map(
      (resource) =>
        `${resource.metadata.name} ${resource.metadata.namespace ?? ''} ${resource.kind}`,
    ),
    ...workload.routes.flatMap(routeHosts),
    kindLabel(workload.resource),
    workload.health.label,
  ]
    .join(' ')
    .toLowerCase();
  return search
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .every((term) => text.includes(term));
}
