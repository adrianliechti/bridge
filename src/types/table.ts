// Abstract table types for displaying resources (Kubernetes, Docker, etc.)

import type { KubernetesObject } from '@kubernetes/client-node';

export interface TableColumnDefinition {
  name: string;
  type: string;
  format: string;
  description: string;
  priority: number; // 0 = always shown, higher = less important
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface TableRow<T = any> {
  cells: unknown[];
  object: T; // The raw underlying object
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface TableResponse<T = any> {
  columnDefinitions: TableColumnDefinition[];
  rows: TableRow<T>[];
}

// Resource configuration (generic)
export interface ResourceConfig {
  name: string; // Resource name (e.g., "pods", "containers")
  namespaced?: boolean; // Whether the resource is namespaced
}

// Kubernetes-specific types (using SDK types)
export type { KubernetesObject } from '@kubernetes/client-node';

export interface KubernetesTableRow extends TableRow<KubernetesObject> {
  object: KubernetesObject;
}

export interface KubernetesTableResponse extends TableResponse<KubernetesObject> {
  apiVersion: string;
  kind: string;
  metadata: {
    resourceVersion: string;
  };
  rows: KubernetesTableRow[];
}

// Helper to get unique ID from any object
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getObjectId(obj: any): string {
  if (obj?.metadata?.uid) {
    return obj.metadata.uid;
  }
  if (obj?.Id) {
    return obj.Id;
  }
  if (obj?.Name) {
    return obj.Name;
  }
  
  return JSON.stringify(obj);
}

// Helper to get namespace from any object
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getObjectNamespace(obj: any): string | undefined {
  if (obj?.metadata?.namespace) {
    return obj.metadata.namespace;
  }
  return undefined;
}
