import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getPolicyDirection,
  describePolicyPort,
  selectorTerms,
} from '../src/components/kubernetes/networkPolicy.ts';

test('empty ingress rules isolate pods, while an empty rule allows all ingress', () => {
  assert.equal(getPolicyDirection({ podSelector: {}, ingress: [] }, 'Ingress').mode, 'deny-all');
  assert.equal(getPolicyDirection({ podSelector: {}, ingress: [{}] }, 'Ingress').mode, 'allow-all');
  assert.equal(getPolicyDirection({ podSelector: {} }, 'Egress').mode, 'unmanaged');
});

test('policy direction defaults follow Kubernetes and explicit policyTypes take precedence', () => {
  const defaultEgress = { podSelector: {}, egress: [{ ports: [{ port: 53, protocol: 'UDP' }] }] };
  assert.equal(getPolicyDirection(defaultEgress, 'Ingress').mode, 'deny-all');
  assert.equal(getPolicyDirection(defaultEgress, 'Egress').mode, 'restricted');
  assert.equal(getPolicyDirection({ podSelector: {}, egress: [] }, 'Egress').mode, 'unmanaged');
  const egressOnly = { podSelector: {}, policyTypes: ['Egress'], egress: [] };
  assert.equal(getPolicyDirection(egressOnly, 'Ingress').mode, 'unmanaged');
  assert.equal(getPolicyDirection(egressOnly, 'Egress').mode, 'deny-all');
});

test('peer intersections and alternative peers remain distinct; raw API from field is used', () => {
  const peer = {
    namespaceSelector: { matchLabels: { team: 'frontend' } },
    podSelector: { matchLabels: { role: 'web' } },
  };
  const block = { ipBlock: { cidr: '10.0.0.0/8', except: ['10.1.0.0/16'] } };
  const rules = getPolicyDirection(
    { podSelector: {}, ingress: [{ from: [peer, block], ports: [{ port: 8080 }] }] },
    'Ingress',
  );
  assert.equal(rules.mode, 'restricted');
  assert.deepEqual(rules.rules[0].peers, [peer, block]);
  assert.equal(
    getPolicyDirection(
      { podSelector: {}, ingress: [{ from: [{ namespaceSelector: {} }] }] },
      'Ingress',
    ).mode,
    'restricted',
    'all cluster pods is not all IP addresses',
  );
  assert.equal(
    getPolicyDirection({ podSelector: {}, ingress: [{ ports: [{}] }] }, 'Ingress').mode,
    'restricted',
    'an empty port object is TCP, not all protocols',
  );
});

test('selectors retain all requirements and ports retain ranges, names, and protocol defaults', () => {
  assert.deepEqual(
    selectorTerms({
      matchLabels: { app: 'api' },
      matchExpressions: [
        { key: 'tier', operator: 'In', values: ['backend', 'worker'] },
        { key: 'stage', operator: 'NotIn', values: ['dev'] },
        { key: 'enabled', operator: 'Exists' },
        { key: 'disabled', operator: 'DoesNotExist' },
      ],
    }),
    ['app=api', 'tier in (backend,worker)', 'stage notin (dev)', 'enabled', '!disabled'],
  );
  assert.deepEqual(selectorTerms({}), []);
  assert.equal(describePolicyPort({ port: 8000, endPort: 9000 }), 'TCP 8000–9000');
  assert.equal(describePolicyPort({ port: 'http' }), 'TCP http (named)');
  assert.equal(describePolicyPort({ protocol: 'UDP' }), 'All UDP ports');
});
