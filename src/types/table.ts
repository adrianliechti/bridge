// Kubernetes Table API types
// When requesting with Accept: application/json;as=Table;v=v1;g=meta.k8s.io

export interface TableColumnDefinition {
  name: string;
  type: string;
  format: string;
  description: string;
  priority: number; // 0 = always shown, higher = less important
}

export interface TableRow {
  cells: unknown[];
  object: {
    apiVersion: string;
    kind: string;
    metadata: {
      name: string;
      namespace?: string;
      uid: string;
      creationTimestamp: string;
      resourceVersion: string;
    };
  };
}

export interface TableResponse {
  apiVersion: string;
  kind: string;
  metadata: {
    resourceVersion: string;
  };
  columnDefinitions: TableColumnDefinition[];
  rows: TableRow[];
}
