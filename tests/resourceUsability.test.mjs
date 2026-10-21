import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getResourceStatus } from '../src/components/resourceStatus.ts';
import { parseResourceManifest } from '../src/components/kubernetes/manifest.ts';
import {
  discoverResources,
  clearDiscoveryCache,
  getResourceConfigByQualifiedName,
} from '../src/api/kubernetes/kubernetesDiscovery.ts';

test('unhealthy and negated statuses never appear healthy', () => {
  for (const status of [
    'NotReady',
    'Not Ready',
    'unhealthy',
    'Running (unhealthy)',
    'Unavailable',
    'Inactive',
    'CrashLoopBackOff',
  ]) {
    assert.equal(getResourceStatus(status), 'error', status);
  }
  for (const status of ['Running', 'Ready', 'Healthy', 'Completed', '2/2']) {
    assert.equal(getResourceStatus(status), 'success', status);
  }
  assert.equal(getResourceStatus('0/2'), 'warning');
  assert.equal(getResourceStatus('0/0'), 'neutral');
});

const resource = {
  apiVersion: 'v1',
  kind: 'ConfigMap',
  metadata: { name: 'settings', namespace: 'default' },
  data: { key: 'value' },
};
test('manifest validation rejects empty, scalar, list, and renamed resources', () => {
  for (const value of ['', 'null', 'hello', '[]', '{}']) {
    assert.throws(() => parseResourceManifest(value, resource));
  }
  for (const updated of [
    { ...resource, kind: 'Secret' },
    { ...resource, apiVersion: 'apps/v1' },
    { ...resource, metadata: { ...resource.metadata, name: 'another' } },
    { ...resource, metadata: { ...resource.metadata, namespace: 'other' } },
  ]) {
    assert.throws(() => parseResourceManifest(JSON.stringify(updated), resource), /unchanged/);
  }
  const updated = { ...resource, data: { key: 'edited' } };
  assert.deepEqual(parseResourceManifest(JSON.stringify(updated), resource), updated);
});

test('failed discovery remains retryable after the cluster recovers', async (t) => {
  clearDiscoveryCache();
  let failed = true;
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url) => {
    calls++;
    if (failed) return new Response('{"message":"cluster offline"}', { status: 503 });
    return Response.json(
      url.endsWith('/api/v1') ? { resources: [{ name: 'pods', kind: 'Pod' }] } : { groups: [] },
    );
  });
  await assert.rejects(discoverResources('recover'), /cluster offline/);
  failed = false;
  assert.equal((await discoverResources('recover')).get('pods').kind, 'Pod');
  const afterRecovery = calls;
  await discoverResources('recover');
  assert.equal(calls, afterRecovery, 'successful discovery is cached');
});

test('partial discovery keeps qualified resources available without caching failures', async (t) => {
  clearDiscoveryCache();
  let coreFailed = true;
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (url.endsWith('/api/v1'))
      return coreFailed
        ? new Response('core unavailable', { status: 503 })
        : Response.json({ resources: [{ name: 'pods', kind: 'Pod' }] });
    if (url.endsWith('/apis'))
      return Response.json({
        groups: [{ name: 'example.test', preferredVersion: { version: 'v1' } }],
      });
    return Response.json({ resources: [{ name: 'widgets', kind: 'Widget' }] });
  });
  assert.equal(
    (await getResourceConfigByQualifiedName('partial', 'widgets.example.test')).kind,
    'Widget',
  );
  coreFailed = false;
  assert.equal((await discoverResources('partial')).get('pods').kind, 'Pod');
});
