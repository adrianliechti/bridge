import type {
  V1LabelSelector,
  V1NetworkPolicy,
  V1NetworkPolicySpec,
  V1NetworkPolicyPeer,
  V1NetworkPolicyPort,
} from '@kubernetes/client-node';

// The generated SDK calls the wire field `from` `_from`; fetch returns raw JSON.
export type NetworkPolicySpec = Omit<V1NetworkPolicySpec, 'ingress'> & {
  ingress?: { from?: V1NetworkPolicyPeer[]; ports?: V1NetworkPolicyPort[] }[];
};
export type NetworkPolicyResource = Omit<V1NetworkPolicy, 'spec'> & { spec?: NetworkPolicySpec };

export type PolicyDirection = 'Ingress' | 'Egress';
export interface PolicyRule {
  peers: V1NetworkPolicyPeer[];
  ports: V1NetworkPolicyPort[];
}

// Kubernetes label-selector syntax, suitable for both display and list queries.
export function selectorTerms(selector: V1LabelSelector = {}): string[] {
  return [
    ...Object.entries(selector.matchLabels ?? {}).map(([key, value]) => `${key}=${value}`),
    ...(selector.matchExpressions ?? []).map(({ key, operator, values = [] }) => {
      switch (operator) {
        case 'In':
          return `${key} in (${values.join(',')})`;
        case 'NotIn':
          return `${key} notin (${values.join(',')})`;
        case 'Exists':
          return key;
        case 'DoesNotExist':
          return `!${key}`;
        default:
          return `${key} ${operator} (${values.join(',')})`;
      }
    }),
  ];
}

export function describePolicyPort(port: V1NetworkPolicyPort): string {
  const protocol = port.protocol ?? 'TCP';
  if (port.port === undefined) return `All ${protocol} ports`;
  const target = port.endPort === undefined ? String(port.port) : `${port.port}–${port.endPort}`;
  return `${protocol} ${target}${typeof port.port === 'string' ? ' (named)' : ''}`;
}

export function getPolicyDirection(spec: NetworkPolicySpec, direction: PolicyDirection) {
  const types = spec.policyTypes?.length
    ? spec.policyTypes
    : ['Ingress', ...(spec.egress?.length ? ['Egress'] : [])];
  const rules: PolicyRule[] =
    direction === 'Ingress'
      ? (spec.ingress ?? []).map((rule) => ({ peers: rule.from ?? [], ports: rule.ports ?? [] }))
      : (spec.egress ?? []).map((rule) => ({ peers: rule.to ?? [], ports: rule.ports ?? [] }));
  const mode = !types.includes(direction)
    ? 'unmanaged'
    : rules.length === 0
      ? 'deny-all'
      : rules.some((rule) => rule.peers.length === 0 && rule.ports.length === 0)
        ? 'allow-all'
        : 'restricted';
  return { mode, rules } as const;
}
