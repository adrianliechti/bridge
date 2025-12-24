// Kubernetes API client for browser
// Assumes kubectl proxy is running and proxied at /api/

import type {
  PodList,
  ServiceList,
  DeploymentList,
  ReplicaSetList,
  ConfigMapList,
  SecretList,
  NamespaceList,
  NodeList,
  PersistentVolumeList,
  PersistentVolumeClaimList,
  EventList,
  IngressList,
  DaemonSetList,
  StatefulSetList,
  JobList,
  CronJobList,
} from '../types/kubernetes';

// Kubernetes API paths
const CORE_V1 = '/api/v1';
const APPS_V1 = '/apis/apps/v1';
const BATCH_V1 = '/apis/batch/v1';
const NETWORKING_V1 = '/apis/networking.k8s.io/v1';

async function fetchApi<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

// Core V1 resources
export async function getNamespaces(): Promise<NamespaceList> {
  return fetchApi<NamespaceList>(`${CORE_V1}/namespaces`);
}

export async function getPods(namespace?: string): Promise<PodList> {
  const url = namespace
    ? `${CORE_V1}/namespaces/${namespace}/pods`
    : `${CORE_V1}/pods`;
  return fetchApi<PodList>(url);
}

export async function getServices(namespace?: string): Promise<ServiceList> {
  const url = namespace
    ? `${CORE_V1}/namespaces/${namespace}/services`
    : `${CORE_V1}/services`;
  return fetchApi<ServiceList>(url);
}

export async function getConfigMaps(namespace?: string): Promise<ConfigMapList> {
  const url = namespace
    ? `${CORE_V1}/namespaces/${namespace}/configmaps`
    : `${CORE_V1}/configmaps`;
  return fetchApi<ConfigMapList>(url);
}

export async function getSecrets(namespace?: string): Promise<SecretList> {
  const url = namespace
    ? `${CORE_V1}/namespaces/${namespace}/secrets`
    : `${CORE_V1}/secrets`;
  return fetchApi<SecretList>(url);
}

export async function getNodes(): Promise<NodeList> {
  return fetchApi<NodeList>(`${CORE_V1}/nodes`);
}

export async function getPersistentVolumes(): Promise<PersistentVolumeList> {
  return fetchApi<PersistentVolumeList>(`${CORE_V1}/persistentvolumes`);
}

export async function getPersistentVolumeClaims(namespace?: string): Promise<PersistentVolumeClaimList> {
  const url = namespace
    ? `${CORE_V1}/namespaces/${namespace}/persistentvolumeclaims`
    : `${CORE_V1}/persistentvolumeclaims`;
  return fetchApi<PersistentVolumeClaimList>(url);
}

export async function getEvents(namespace?: string): Promise<EventList> {
  const url = namespace
    ? `${CORE_V1}/namespaces/${namespace}/events`
    : `${CORE_V1}/events`;
  return fetchApi<EventList>(url);
}

// Apps V1 resources
export async function getDeployments(namespace?: string): Promise<DeploymentList> {
  const url = namespace
    ? `${APPS_V1}/namespaces/${namespace}/deployments`
    : `${APPS_V1}/deployments`;
  return fetchApi<DeploymentList>(url);
}

export async function getReplicaSets(namespace?: string): Promise<ReplicaSetList> {
  const url = namespace
    ? `${APPS_V1}/namespaces/${namespace}/replicasets`
    : `${APPS_V1}/replicasets`;
  return fetchApi<ReplicaSetList>(url);
}

export async function getDaemonSets(namespace?: string): Promise<DaemonSetList> {
  const url = namespace
    ? `${APPS_V1}/namespaces/${namespace}/daemonsets`
    : `${APPS_V1}/daemonsets`;
  return fetchApi<DaemonSetList>(url);
}

export async function getStatefulSets(namespace?: string): Promise<StatefulSetList> {
  const url = namespace
    ? `${APPS_V1}/namespaces/${namespace}/statefulsets`
    : `${APPS_V1}/statefulsets`;
  return fetchApi<StatefulSetList>(url);
}

// Batch V1 resources
export async function getJobs(namespace?: string): Promise<JobList> {
  const url = namespace
    ? `${BATCH_V1}/namespaces/${namespace}/jobs`
    : `${BATCH_V1}/jobs`;
  return fetchApi<JobList>(url);
}

export async function getCronJobs(namespace?: string): Promise<CronJobList> {
  const url = namespace
    ? `${BATCH_V1}/namespaces/${namespace}/cronjobs`
    : `${BATCH_V1}/cronjobs`;
  return fetchApi<CronJobList>(url);
}

// Networking V1 resources
export async function getIngresses(namespace?: string): Promise<IngressList> {
  const url = namespace
    ? `${NETWORKING_V1}/namespaces/${namespace}/ingresses`
    : `${NETWORKING_V1}/ingresses`;
  return fetchApi<IngressList>(url);
}
