import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowDownLeft, ArrowUpRight, ArrowRight, Box, Network, ShieldCheck } from 'lucide-react';
import type { V1LabelSelector, V1NetworkPolicyPeer, V1PodList } from '@kubernetes/client-node';
import { responseError } from '../../api/errors';
import {
  selectorTerms,
  describePolicyPort,
  getPolicyDirection,
  type PolicyDirection,
  type NetworkPolicyResource,
} from './networkPolicy';

function Selector({ selector, empty }: { selector?: V1LabelSelector; empty: string }) {
  const terms = selectorTerms(selector);
  return terms.length ? (
    <div className="flex flex-wrap items-center gap-1.5">
      {terms.map((term, index) => (
        <span key={term} className="contents">
          {index > 0 && <span className="text-[10px] text-neutral-400">AND</span>}
          <code className="max-w-full break-all rounded bg-neutral-200/70 dark:bg-neutral-700/60 px-1.5 py-1 text-[11px]">
            {term}
          </code>
        </span>
      ))}
    </div>
  ) : (
    <span className="text-xs">{empty}</span>
  );
}

function Peer({ peer, namespace }: { peer: V1NetworkPolicyPeer; namespace: string }) {
  if (peer.ipBlock) {
    return (
      <div className="space-y-1.5 text-xs">
        <div className="flex items-center gap-2">
          <Network size={13} />
          <code>{peer.ipBlock.cidr}</code>
        </div>
        {!!peer.ipBlock.except?.length && (
          <div className="text-amber-700 dark:text-amber-400 break-all">
            Except {peer.ipBlock.except.join(', ')}
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-2 text-neutral-700 dark:text-neutral-300">
      <div className="space-y-1">
        <div className="text-[10px] uppercase tracking-wide text-neutral-500">Namespaces</div>
        {peer.namespaceSelector !== undefined ? (
          <Selector selector={peer.namespaceSelector} empty="All namespaces" />
        ) : (
          <span className="text-xs">{namespace} (same namespace)</span>
        )}
      </div>
      <div className="space-y-1">
        <div className="text-[10px] uppercase tracking-wide text-neutral-500">AND pods</div>
        <Selector selector={peer.podSelector} empty="All pods in these namespaces" />
      </div>
    </div>
  );
}

const modeLabels = {
  unmanaged: 'Not isolated here',
  'deny-all': 'Deny all by default',
  'allow-all': 'Allow all',
  restricted: 'Selected traffic',
};

export function NetworkPolicyView({
  context,
  policy,
}: {
  context: string;
  policy: NetworkPolicyResource;
}) {
  const [direction, setDirection] = useState<PolicyDirection>(() =>
    policy.spec && getPolicyDirection(policy.spec, 'Ingress').mode === 'unmanaged'
      ? 'Egress'
      : 'Ingress',
  );
  const namespace = policy.metadata?.namespace ?? '';
  const selector = selectorTerms(policy.spec?.podSelector).join(',');
  const pods = useQuery({
    queryKey: ['kubernetes', 'network-policy-pods', context, namespace, selector],
    enabled: !!namespace && !!policy.spec,
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams();
      if (selector) params.set('labelSelector', selector);
      const response = await fetch(
        `/contexts/${encodeURIComponent(context)}/api/v1/namespaces/${encodeURIComponent(namespace)}/pods?${params}`,
        { signal },
      );
      if (!response.ok)
        throw new Error(await responseError(response, 'Unable to load selected pods'));
      return (await response.json()) as V1PodList;
    },
  });
  if (!policy.spec)
    return <div className="text-sm text-neutral-500">No policy specification available.</div>;
  const { mode, rules } = getPolicyDirection(policy.spec, direction);
  const incoming = direction === 'Ingress';

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-blue-200 dark:border-blue-500/30 bg-blue-50/60 dark:bg-blue-500/5 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-medium text-neutral-900 dark:text-neutral-100">
            <Box size={16} className="text-blue-500" />
            Selected pods
          </div>
          <span className="text-xs text-neutral-500 break-all">Namespace: {namespace}</span>
        </div>
        <Selector selector={policy.spec.podSelector} empty="All pods in this namespace" />
        {pods.isLoading ? (
          <p className="text-xs text-neutral-500">Finding matching pods...</p>
        ) : pods.error ? (
          <div role="alert" className="text-xs text-amber-700 dark:text-amber-400">
            Pod matches unavailable: {pods.error.message}
            <button onClick={() => void pods.refetch()} className="ml-2 underline">
              Retry
            </button>
          </div>
        ) : (
          pods.data && (
            <details className="text-xs">
              <summary className="cursor-pointer text-blue-700 dark:text-blue-400">
                {pods.data.items.length === 0
                  ? 'No matching pods — this policy currently selects nothing'
                  : `${pods.data.items.length} matching ${pods.data.items.length === 1 ? 'pod' : 'pods'}`}
              </summary>
              <div className="mt-2 max-h-40 overflow-auto flex flex-wrap gap-1.5">
                {pods.data.items.map((pod) => (
                  <Link
                    key={pod.metadata?.uid ?? pod.metadata?.name}
                    to="/cluster/$context/$resourceType/$name"
                    params={{ context, resourceType: 'pods', name: pod.metadata?.name ?? '' }}
                    search={{ namespace }}
                    className="max-w-full break-all rounded px-2 py-1 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:underline"
                  >
                    {pod.metadata?.name}
                  </Link>
                ))}
              </div>
            </details>
          )
        )}
      </section>

      <div className="grid grid-cols-2 gap-3" aria-label="Traffic direction">
        {(['Ingress', 'Egress'] as const).map((item) => {
          const summary = getPolicyDirection(policy.spec!, item);
          const Icon = item === 'Ingress' ? ArrowDownLeft : ArrowUpRight;
          return (
            <button
              key={item}
              type="button"
              aria-pressed={direction === item}
              onClick={() => setDirection(item)}
              className={`p-3 rounded-xl border text-left transition-colors ${direction === item ? 'border-blue-400 bg-blue-50 dark:bg-blue-500/10' : 'border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800'}`}
            >
              <div className="flex items-center gap-2 text-sm font-medium text-neutral-900 dark:text-neutral-100">
                <Icon size={16} className="text-blue-500" />
                {item}
              </div>
              <div className="mt-2 text-xs text-neutral-700 dark:text-neutral-300">
                {modeLabels[summary.mode]}
              </div>
              <div className="mt-1 text-[11px] text-neutral-500">
                {summary.mode === 'unmanaged'
                  ? 'No isolation from this policy'
                  : `${summary.rules.length} allow ${summary.rules.length === 1 ? 'rule' : 'rules'}`}
              </div>
            </button>
          );
        })}
      </div>

      <section aria-label={`${direction} rules`} className="space-y-3">
        <div className="flex items-center gap-2 text-xs font-medium text-neutral-500">
          <span>{incoming ? 'Sources' : 'Selected pods'}</span>
          <ArrowRight size={14} />
          <span>{incoming ? 'Selected pods' : 'Destinations'}</span>
        </div>
        {mode === 'unmanaged' ? (
          <p className="p-4 rounded-lg bg-neutral-100 dark:bg-neutral-800/50 text-sm text-neutral-600 dark:text-neutral-400">
            This policy does not isolate {direction.toLowerCase()}. Other policies may still
            restrict this direction.
          </p>
        ) : mode === 'deny-all' ? (
          <div className="p-4 rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/5 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-400">
              <ShieldCheck size={16} />
              No {direction.toLowerCase()} allow rules
            </div>
            <p className="text-xs text-neutral-600 dark:text-neutral-400">
              Selected pods are isolated for this direction. Traffic can still be allowed by another
              policy selecting the same pods.
            </p>
          </div>
        ) : (
          rules.map((rule, index) => (
            <div
              key={index}
              className="rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden"
            >
              <div className="px-3 py-2 bg-neutral-100 dark:bg-neutral-800 flex items-center justify-between text-xs">
                <span className="font-medium">Allow rule {index + 1}</span>
                {index > 0 && <span className="text-neutral-500">OR previous rules</span>}
              </div>
              <div className="p-3 space-y-3">
                <div className="text-[10px] uppercase tracking-wide text-neutral-500">
                  {incoming ? 'From' : 'To'}
                </div>
                {rule.peers.length === 0 ? (
                  <p className="text-sm text-neutral-700 dark:text-neutral-300">
                    {incoming ? 'Any source' : 'Any destination'} (including outside the cluster)
                  </p>
                ) : (
                  rule.peers.map((peer, peerIndex) => (
                    <div key={peerIndex} className="space-y-2">
                      {peerIndex > 0 && (
                        <div className="text-[10px] font-medium text-blue-500">OR</div>
                      )}
                      <Peer peer={peer} namespace={namespace} />
                    </div>
                  ))
                )}
                <div className="pt-3 border-t border-neutral-200 dark:border-neutral-700 space-y-2">
                  <div className="text-[10px] uppercase tracking-wide text-neutral-500">
                    AND on ports
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {rule.ports.length === 0 ? (
                      <span className="text-xs">All ports and protocols</span>
                    ) : (
                      rule.ports.map((port, portIndex) => (
                        <span
                          key={portIndex}
                          className="rounded bg-blue-50 dark:bg-blue-500/10 px-2 py-1 text-xs text-blue-700 dark:text-blue-300"
                        >
                          {describePolicyPort(port)}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </section>
      <p className="text-[11px] leading-relaxed text-neutral-500">
        This view describes one policy, not a connectivity test. Allow rules from all matching
        policies combine; pod-to-pod traffic must satisfy source egress and destination ingress.
        Enforcement depends on the cluster’s network plugin.
      </p>
    </div>
  );
}
