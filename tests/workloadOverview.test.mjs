import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  attentionOrder,
  buildWorkloads,
  clusterSummary,
  groupByNamespace,
  kindLabel,
  matchesWorkload,
  needsAttention,
  podHealth,
  routeHosts,
  workloadHealth,
} from '../src/components/kubernetes/workloadOverview.ts';

function resource(kind, name, extra = {}) {
  return {
    apiVersion: 'v1',
    kind,
    ...extra,
    metadata: { name, namespace: 'production', uid: `${kind}/${name}`, ...extra.metadata },
  };
}
const owner = (parent) => [
  {
    apiVersion: parent.apiVersion,
    kind: parent.kind,
    name: parent.metadata.name,
    uid: parent.metadata.uid,
    controller: true,
  },
];
const readyStatus = {
  phase: 'Running',
  conditions: [{ type: 'Ready', status: 'True' }],
  containerStatuses: [{ name: 'app', ready: true, state: { running: {} } }],
};
const readyPod = (name, extra = {}) =>
  resource('Pod', name, { spec: { containers: [{ name: 'app' }] }, status: readyStatus, ...extra });

test('overview follows controller ownership through ReplicaSets without duplicating pods', () => {
  const deployment = resource('Deployment', 'payments', {
    spec: { replicas: 1 },
    status: { readyReplicas: 1 },
  });
  const replicaSet = resource('ReplicaSet', 'payments-rs', {
    metadata: { ownerReferences: owner(deployment) },
  });
  const pod = readyPod('payments-abc', { metadata: { ownerReferences: owner(replicaSet) } });
  const standalone = readyPod('debug');
  const rows = buildWorkloads([pod, replicaSet, standalone, deployment]);
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.find((row) => row.resource.kind === 'Deployment').pods.map((pod) => pod.metadata.name),
    ['payments-abc'],
  );
  assert.equal(rows.find((row) => row.resource.kind === 'Pod').resource.metadata.name, 'debug');
});

test('missing controllers do not hide pods, and non-controller references do not group workloads', () => {
  const deployment = resource('Deployment', 'unavailable');
  const pod = readyPod('orphan', { metadata: { ownerReferences: owner(deployment) } });
  assert.equal(buildWorkloads([pod])[0].resource, pod);
  const independent = readyPod('independent', {
    metadata: { ownerReferences: owner(deployment).map((ref) => ({ ...ref, controller: false })) },
  });
  assert.equal(buildWorkloads([deployment, independent]).length, 2);
});

test('service selectors and storage references are scoped to the exact namespace', () => {
  const deployment = resource('Deployment', 'api', {
    spec: {
      replicas: 0,
      template: {
        metadata: { labels: { app: 'api', tier: 'backend' } },
        spec: { volumes: [{ persistentVolumeClaim: { claimName: 'data' } }] },
      },
    },
  });
  const services = [
    resource('Service', 'api-http', { spec: { selector: { app: 'api', tier: 'backend' } } }),
    resource('Service', 'wrong-tier', { spec: { selector: { app: 'api', tier: 'frontend' } } }),
    resource('Service', 'no-selector', { spec: {} }),
    resource('Service', 'cross-namespace', {
      metadata: { namespace: 'staging' },
      spec: { selector: { app: 'api' } },
    }),
  ];
  const claims = [
    resource('PersistentVolumeClaim', 'data'),
    resource('PersistentVolumeClaim', 'data', {
      metadata: { namespace: 'staging', uid: 'other-data' },
    }),
    resource('PersistentVolumeClaim', 'unused'),
  ];
  const [row] = buildWorkloads([deployment, ...services, ...claims]);
  assert.deepEqual(
    row.services.map((service) => service.metadata.name),
    ['api-http'],
  );
  assert.deepEqual(
    row.claims.map((claim) => claim.metadata.namespace),
    ['production'],
  );
  assert.equal(row.health.label, 'Scaled to zero');
  assert.equal(matchesWorkload(row, 'PRODUCTION api-http'), true);
  assert.equal(matchesWorkload(row, 'unused'), false);
});

test('Running pods with waiting or failed containers need attention; old failures do not', () => {
  const crashing = readyPod('crashing', {
    status: {
      ...readyStatus,
      containerStatuses: [
        {
          name: 'app',
          ready: false,
          state: {
            waiting: { reason: 'CrashLoopBackOff', message: 'Restarting failed container' },
          },
        },
      ],
    },
  });
  assert.equal(podHealth(crashing).tone, 'error');
  assert.equal(podHealth(crashing).label, 'CrashLoopBackOff');
  assert.equal(podHealth(crashing).progress, '0/1');
  const recovered = readyPod('recovered', {
    status: {
      ...readyStatus,
      containerStatuses: [
        {
          ...readyStatus.containerStatuses[0],
          lastState: { terminated: { reason: 'OOMKilled', exitCode: 137 } },
        },
      ],
    },
  });
  assert.equal(needsAttention(podHealth(recovered)), false);
  const unready = readyPod('unready', {
    status: { ...readyStatus, conditions: [{ type: 'Ready', status: 'False' }] },
  });
  assert.equal(podHealth(unready).label, 'Not ready');
});

test('init container errors take precedence over normal startup and scheduling failures remain visible', () => {
  const pod = readyPod('initializing', {
    status: {
      phase: 'Pending',
      initContainerStatuses: [{ name: 'init', state: { waiting: { reason: 'ImagePullBackOff' } } }],
      containerStatuses: [{ name: 'app', state: { waiting: { reason: 'PodInitializing' } } }],
    },
  });
  assert.equal(podHealth(pod).label, 'ImagePullBackOff');
  const pending = readyPod('pending', {
    status: {
      phase: 'Pending',
      conditions: [
        {
          type: 'PodScheduled',
          status: 'False',
          reason: 'Unschedulable',
          message: 'Insufficient memory',
        },
      ],
    },
  });
  assert.equal(podHealth(pending).detail, 'Insufficient memory');
});

test('controllers use desired replicas and surface pod failures and rollout failures', () => {
  const deployment = resource('Deployment', 'api', {
    spec: { replicas: 3 },
    status: { replicas: 2, readyReplicas: 2 },
  });
  assert.equal(workloadHealth(deployment, []).progress, '2/3');
  assert.equal(workloadHealth(deployment, []).tone, 'warning');
  const pod = readyPod('broken', { status: { phase: 'Failed', reason: 'Evicted' } });
  assert.equal(workloadHealth(deployment, [pod]).label, 'Evicted');
  const failed = {
    ...deployment,
    status: {
      readyReplicas: 0,
      conditions: [{ type: 'Progressing', status: 'False', reason: 'ProgressDeadlineExceeded' }],
    },
  };
  assert.equal(workloadHealth(failed, []).tone, 'error');
  const daemonSet = resource('DaemonSet', 'agent', {
    status: { desiredNumberScheduled: 4, numberReady: 3 },
  });
  assert.equal(workloadHealth(daemonSet, []).progress, '3/4');
  assert.equal(
    workloadHealth({ ...daemonSet, status: { desiredNumberScheduled: 0 } }, []).label,
    'No scheduled pods',
  );
  assert.equal(workloadHealth(resource('DaemonSet', 'unknown'), []).label, 'Status unknown');
});

test('completed and suspended jobs are not unhealthy; failed jobs are; active retries ignore old failed pods', () => {
  const failedPod = readyPod('old-attempt', { status: { phase: 'Failed' } });
  const complete = resource('Job', 'backup', {
    spec: { completions: 1 },
    status: { succeeded: 1, conditions: [{ type: 'Complete', status: 'True' }] },
  });
  assert.equal(needsAttention(workloadHealth(complete, [failedPod])), false);
  assert.equal(workloadHealth(complete, []).progress, '1/1');
  assert.equal(
    workloadHealth({ ...complete, spec: {}, status: { ...complete.status, succeeded: 3 } }, [])
      .progress,
    '3',
    'work-queue jobs have no fixed completion target',
  );
  const suspended = resource('Job', 'paused', { spec: { suspend: true } });
  assert.equal(workloadHealth(suspended, []).label, 'Suspended');
  const failed = resource('Job', 'failed', {
    status: { conditions: [{ type: 'Failed', status: 'True', reason: 'BackoffLimitExceeded' }] },
  });
  assert.equal(workloadHealth(failed, []).tone, 'error');
  const retrying = resource('Job', 'retrying', { status: { active: 1, failed: 1 } });
  assert.equal(workloadHealth(retrying, [failedPod, readyPod('new-attempt')]).label, 'Running');
});

test('attention order places errors before pending workloads and healthy ones, without merging equal names', () => {
  const healthy = readyPod('aaa');
  const error = readyPod('zzz', { status: { phase: 'Failed' } });
  const pending = readyPod('aaa', {
    metadata: { namespace: 'staging', uid: 'staging/aaa' },
    status: { phase: 'Pending' },
  });
  const rows = buildWorkloads([healthy, pending, error]);
  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.map((row) => `${row.resource.metadata.namespace}/${row.resource.metadata.name}`),
    ['production/aaa', 'production/zzz', 'staging/aaa'],
    'the map keeps a stable name order while statuses change',
  );
  assert.deepEqual(
    [...rows].sort(attentionOrder).map((row) => row.health.tone),
    ['error', 'warning', 'success'],
  );
});

test('pods join their Deployment through the ReplicaSet naming convention without listing ReplicaSets', () => {
  const deployment = resource('Deployment', 'web', {
    spec: { replicas: 2, selector: { matchLabels: { app: 'web' } } },
    status: { readyReplicas: 2 },
  });
  const replicaSetOwner = (name) => [
    { apiVersion: 'apps/v1', kind: 'ReplicaSet', name, uid: `rs/${name}`, controller: true },
  ];
  const current = readyPod('web-7c9f-a', {
    metadata: {
      labels: { app: 'web', 'pod-template-hash': '7c9f' },
      ownerReferences: replicaSetOwner('web-7c9f'),
    },
  });
  const previous = readyPod('web-55aa-b', {
    metadata: {
      labels: { app: 'web', 'pod-template-hash': '55aa' },
      ownerReferences: replicaSetOwner('web-55aa'),
    },
  });
  const rows = buildWorkloads([deployment, current, previous]);
  assert.equal(rows.length, 1);
  assert.deepEqual(
    rows[0].pods.map((pod) => pod.metadata.name),
    ['web-55aa-b', 'web-7c9f-a'],
  );

  const foreign = readyPod('web-1111-c', {
    metadata: {
      labels: { app: 'other', 'pod-template-hash': '1111' },
      ownerReferences: replicaSetOwner('web-1111'),
    },
  });
  const unready = resource('Pod', 'web-1111-d', {
    spec: { containers: [{ name: 'app' }] },
    status: { phase: 'Pending' },
    metadata: {
      labels: { app: 'other', 'pod-template-hash': '1111' },
      ownerReferences: replicaSetOwner('web-1111'),
    },
  });
  const standalone = buildWorkloads([deployment, foreign, unready]).find(
    (row) => row.resource.kind === 'ReplicaSet',
  );
  assert.equal(standalone.resource.metadata.name, 'web-1111', 'selector mismatch keeps them apart');
  assert.equal(standalone.pods.length, 2, 'pods of an unlisted ReplicaSet stay together');
  assert.equal(standalone.health.progress, '1/2');
  assert.equal(standalone.health.tone, 'warning');
});

test('CronJobs own their runs and report the latest one', () => {
  const cronJob = resource('CronJob', 'report', {
    apiVersion: 'batch/v1',
    spec: { schedule: '*/5 * * * *' },
    status: { lastScheduleTime: '2026-01-01T00:10:00Z' },
  });
  const run = (name, minute, status) =>
    resource('Job', name, {
      metadata: {
        creationTimestamp: `2026-01-01T00:${minute}:00Z`,
        ownerReferences: owner(cronJob),
      },
      spec: { completions: 1 },
      status,
    });
  const failedRun = run('report-1', '05', {
    conditions: [{ type: 'Failed', status: 'True', reason: 'BackoffLimitExceeded' }],
  });
  const passedRun = run('report-2', '10', {
    succeeded: 1,
    conditions: [{ type: 'Complete', status: 'True' }],
  });
  const pod = readyPod('report-2-xyz', {
    metadata: { ownerReferences: owner(passedRun) },
    status: { phase: 'Succeeded' },
  });

  const [recovered] = buildWorkloads([cronJob, failedRun, passedRun, pod]);
  assert.equal(recovered.resource.kind, 'CronJob');
  assert.equal(recovered.pods.length, 1);
  assert.equal(recovered.health.label, 'Scheduled');
  assert.equal(recovered.health.progress, '*/5 * * * *');

  const [failing] = buildWorkloads([cronJob, passedRun, run('report-3', '15', failedRun.status)]);
  assert.equal(failing.health.tone, 'error');
  assert.equal(failing.health.label, 'Last run failed');
  assert.match(failing.health.detail, /report-3/);

  assert.equal(workloadHealth({ ...cronJob, status: {} }, [], []).label, 'Not run yet');
  assert.equal(
    workloadHealth({ ...cronJob, spec: { ...cronJob.spec, suspend: true } }, [], [passedRun]).label,
    'Suspended',
  );
});

test('cards link routes through services, and config references come from the pod template', () => {
  const deployment = resource('Deployment', 'shop', {
    spec: {
      replicas: 1,
      template: {
        metadata: { labels: { app: 'shop' } },
        spec: {
          containers: [
            {
              name: 'app',
              envFrom: [{ configMapRef: { name: 'shop-env' } }],
              env: [
                { name: 'TOKEN', valueFrom: { secretKeyRef: { name: 'shop-token', key: 't' } } },
              ],
            },
          ],
          volumes: [
            { name: 'tls', secret: { secretName: 'shop-tls' } },
            {
              name: 'token',
              projected: { sources: [{ configMap: { name: 'kube-root-ca.crt' } }] },
            },
          ],
        },
      },
    },
    status: { readyReplicas: 1 },
  });
  const service = resource('Service', 'shop-http', { spec: { selector: { app: 'shop' } } });
  const ingress = resource('Ingress', 'shop', {
    spec: {
      rules: [
        {
          host: 'shop.example.com',
          http: { paths: [{ backend: { service: { name: 'shop-http' } } }] },
        },
      ],
    },
  });
  const unrelated = resource('Ingress', 'other', {
    spec: { defaultBackend: { service: { name: 'other' } } },
  });
  const crossNamespace = resource('HTTPRoute', 'edge', {
    metadata: { namespace: 'gateway' },
    spec: {
      hostnames: ['api.example.com'],
      rules: [{ backendRefs: [{ name: 'shop-http', namespace: 'production' }] }],
    },
  });
  const [row] = buildWorkloads([deployment, service, ingress, unrelated, crossNamespace]);
  assert.deepEqual(
    row.routes.map((route) => route.metadata.name),
    ['edge', 'shop'],
  );
  assert.deepEqual(row.routes.flatMap(routeHosts), ['api.example.com', 'shop.example.com']);
  assert.deepEqual(
    row.config.map((ref) => `${ref.kind}/${ref.metadata.name}`),
    ['ConfigMap/shop-env', 'Secret/shop-tls', 'Secret/shop-token'],
  );
  assert.equal(matchesWorkload(row, 'shop.example'), true);
});

test('static pods, namespace grouping, restarts and the cluster summary', () => {
  const node = resource('Node', 'control-plane', {
    metadata: { namespace: undefined },
    status: { conditions: [{ type: 'Ready', status: 'True' }] },
  });
  const apiServer = readyPod('kube-apiserver', {
    metadata: { namespace: 'kube-system', ownerReferences: owner(node) },
  });
  const crashing = readyPod('crashing', {
    metadata: { namespace: 'apps' },
    status: {
      ...readyStatus,
      conditions: [{ type: 'Ready', status: 'False' }],
      containerStatuses: [
        {
          name: 'app',
          ready: false,
          restartCount: 7,
          state: { waiting: { reason: 'CrashLoopBackOff' } },
        },
      ],
    },
  });
  const done = readyPod('done', {
    metadata: { namespace: 'apps' },
    status: { phase: 'Succeeded' },
  });
  const resources = [node, apiServer, crashing, done];
  const rows = buildWorkloads(resources);
  assert.equal(kindLabel(rows.find((row) => row.resource === apiServer).resource), 'Static pod');
  assert.equal(rows.find((row) => row.resource === crashing).restarts, 7);
  assert.deepEqual(
    groupByNamespace(rows).map((group) => [group.namespace, group.attention]),
    [
      ['apps', 1],
      ['kube-system', 0],
    ],
  );
  assert.deepEqual(clusterSummary(resources), { pods: 2, readyPods: 1, nodes: 1, readyNodes: 1 });
});

test('startup states get a grace period, errors and stuck pods do not', () => {
  const now = Date.parse('2026-01-01T00:10:00Z');
  const createdAt = (minute) => ({ creationTimestamp: `2026-01-01T00:${minute}:00Z` });
  const creating = (minute) =>
    readyPod(`creating-${minute}`, {
      metadata: createdAt(minute),
      status: {
        phase: 'Pending',
        containerStatuses: [{ name: 'app', state: { waiting: { reason: 'ContainerCreating' } } }],
      },
    });
  assert.equal(podHealth(creating('09'), now).tone, 'neutral');
  assert.equal(podHealth(creating('05'), now).tone, 'warning', 'slow starts become visible');
  const crashing = readyPod('young-crash', {
    metadata: createdAt('09'),
    status: {
      phase: 'Running',
      containerStatuses: [
        {
          name: 'app',
          restartCount: 2,
          state: { waiting: { reason: 'CrashLoopBackOff', message: 'back-off 20s' } },
          lastState: { terminated: { exitCode: 137, reason: 'OOMKilled' } },
        },
      ],
    },
  });
  assert.equal(podHealth(crashing, now).tone, 'error');
  assert.equal(podHealth(crashing, now).detail, 'app: exited with code 137 (OOMKilled)');

  const scaling = resource('Deployment', 'web', {
    spec: { replicas: 3 },
    status: { readyReplicas: 2, updatedReplicas: 3 },
  });
  assert.equal(workloadHealth(scaling, [creating('09')], [], now).label, 'Starting');
  assert.equal(workloadHealth(scaling, [], [], now).tone, 'warning');
  const rollingOut = {
    ...scaling,
    metadata: { ...scaling.metadata, generation: 4 },
    status: { ...scaling.status, observedGeneration: 4, updatedReplicas: 1 },
  };
  assert.equal(workloadHealth(rollingOut, [], [], now).label, 'Updating');
  assert.equal(workloadHealth(rollingOut, [], [], now).tone, 'neutral');
});
