// Kubernetes API client using Table format
// This leverages the native kubectl-style table output from the API

import type { TableResponse } from '../types/table';
import type { V1APIResource } from '@kubernetes/client-node';
import { getApiBase } from './kubernetes';

async function fetchTable(url: string): Promise<TableResponse> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json;as=Table;v=v1;g=meta.k8s.io',
    },
  });
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

// Re-export CRD types from @kubernetes/client-node
export type {
  V1APIResource,
  V1CustomResourceDefinition,
  V1CustomResourceDefinitionList,
  V1CustomResourceDefinitionSpec,
  V1CustomResourceDefinitionVersion,
} from '@kubernetes/client-node';

// Get table for a resource (built-in or CRD)
export async function getResourceTable(
  config: V1APIResource,
  namespace?: string
): Promise<TableResponse> {
  const apiBase = getApiBase(config);
  const url = config.namespaced && namespace
    ? `${apiBase}/namespaces/${namespace}/${config.name}`
    : `${apiBase}/${config.name}`;

  return fetchTable(url);
}
