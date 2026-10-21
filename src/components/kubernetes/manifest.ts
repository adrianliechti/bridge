import { parse } from 'yaml';
import type { KubernetesResource } from '../../api/kubernetes/kubernetes';

export function parseResourceManifest(
  value: string,
  original: KubernetesResource,
): KubernetesResource {
  const parsed = parse(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('The manifest must be a Kubernetes resource object.');
  }
  if (parsed.apiVersion !== original.apiVersion || parsed.kind !== original.kind) {
    throw new Error('Keep apiVersion and kind unchanged when editing an existing resource.');
  }
  if (
    parsed.metadata?.name !== original.metadata?.name ||
    (parsed.metadata?.namespace ?? '') !== (original.metadata?.namespace ?? '')
  ) {
    throw new Error(
      'Keep metadata.name and metadata.namespace unchanged when editing an existing resource.',
    );
  }
  return parsed as KubernetesResource;
}
