// Kubernetes API client for browser
// Only used for namespace list in sidebar

interface NamespaceMeta {
  name: string;
  uid: string;
  creationTimestamp: string;
}

interface Namespace {
  metadata: NamespaceMeta;
  status?: { phase: string };
}

interface NamespaceList {
  items: Namespace[];
}

async function fetchApi<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

export async function getNamespaces(): Promise<NamespaceList> {
  return fetchApi<NamespaceList>('/api/v1/namespaces');
}
