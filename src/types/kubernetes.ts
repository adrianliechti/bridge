// Common Kubernetes types

export interface ObjectMeta {
  name: string;
  namespace?: string;
  uid: string;
  creationTimestamp: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  ownerReferences?: OwnerReference[];
}

export interface OwnerReference {
  apiVersion: string;
  kind: string;
  name: string;
  uid: string;
}

export interface ListMeta {
  resourceVersion: string;
  continue?: string;
}

// Pod types
export interface Pod {
  apiVersion: string;
  kind: 'Pod';
  metadata: ObjectMeta;
  spec: PodSpec;
  status: PodStatus;
}

export interface PodSpec {
  containers: Container[];
  nodeName?: string;
  restartPolicy: string;
  serviceAccountName?: string;
}

export interface Container {
  name: string;
  image: string;
  ports?: ContainerPort[];
}

export interface ContainerPort {
  containerPort: number;
  protocol?: string;
}

export interface PodStatus {
  phase: 'Pending' | 'Running' | 'Succeeded' | 'Failed' | 'Unknown';
  conditions?: PodCondition[];
  containerStatuses?: ContainerStatus[];
  podIP?: string;
  startTime?: string;
}

export interface PodCondition {
  type: string;
  status: string;
  lastTransitionTime?: string;
}

export interface ContainerStatus {
  name: string;
  ready: boolean;
  restartCount: number;
  state: {
    running?: { startedAt: string };
    waiting?: { reason: string; message?: string };
    terminated?: { reason: string; exitCode: number };
  };
}

export interface PodList {
  apiVersion: string;
  kind: 'PodList';
  metadata: ListMeta;
  items: Pod[];
}

// Service types
export interface Service {
  apiVersion: string;
  kind: 'Service';
  metadata: ObjectMeta;
  spec: ServiceSpec;
  status?: ServiceStatus;
}

export interface ServiceSpec {
  type: 'ClusterIP' | 'NodePort' | 'LoadBalancer' | 'ExternalName';
  clusterIP?: string;
  ports?: ServicePort[];
  selector?: Record<string, string>;
  externalIPs?: string[];
}

export interface ServicePort {
  name?: string;
  port: number;
  targetPort?: number | string;
  nodePort?: number;
  protocol?: string;
}

export interface ServiceStatus {
  loadBalancer?: {
    ingress?: { ip?: string; hostname?: string }[];
  };
}

export interface ServiceList {
  apiVersion: string;
  kind: 'ServiceList';
  metadata: ListMeta;
  items: Service[];
}

// Deployment types (apps/v1)
export interface Deployment {
  apiVersion: string;
  kind: 'Deployment';
  metadata: ObjectMeta;
  spec: DeploymentSpec;
  status: DeploymentStatus;
}

export interface DeploymentSpec {
  replicas: number;
  selector: LabelSelector;
  template: PodTemplateSpec;
  strategy?: DeploymentStrategy;
}

export interface LabelSelector {
  matchLabels?: Record<string, string>;
}

export interface PodTemplateSpec {
  metadata?: ObjectMeta;
  spec: PodSpec;
}

export interface DeploymentStrategy {
  type: 'Recreate' | 'RollingUpdate';
}

export interface DeploymentStatus {
  replicas?: number;
  readyReplicas?: number;
  updatedReplicas?: number;
  availableReplicas?: number;
  unavailableReplicas?: number;
  conditions?: DeploymentCondition[];
}

export interface DeploymentCondition {
  type: string;
  status: string;
  reason?: string;
  message?: string;
  lastUpdateTime?: string;
  lastTransitionTime?: string;
}

export interface DeploymentList {
  apiVersion: string;
  kind: 'DeploymentList';
  metadata: ListMeta;
  items: Deployment[];
}

// ReplicaSet types (apps/v1)
export interface ReplicaSet {
  apiVersion: string;
  kind: 'ReplicaSet';
  metadata: ObjectMeta;
  spec: ReplicaSetSpec;
  status: ReplicaSetStatus;
}

export interface ReplicaSetSpec {
  replicas: number;
  selector: LabelSelector;
  template: PodTemplateSpec;
}

export interface ReplicaSetStatus {
  replicas: number;
  readyReplicas?: number;
  availableReplicas?: number;
  fullyLabeledReplicas?: number;
}

export interface ReplicaSetList {
  apiVersion: string;
  kind: 'ReplicaSetList';
  metadata: ListMeta;
  items: ReplicaSet[];
}

// ConfigMap types
export interface ConfigMap {
  apiVersion: string;
  kind: 'ConfigMap';
  metadata: ObjectMeta;
  data?: Record<string, string>;
  binaryData?: Record<string, string>;
}

export interface ConfigMapList {
  apiVersion: string;
  kind: 'ConfigMapList';
  metadata: ListMeta;
  items: ConfigMap[];
}

// Secret types
export interface Secret {
  apiVersion: string;
  kind: 'Secret';
  metadata: ObjectMeta;
  type: string;
  data?: Record<string, string>;
  stringData?: Record<string, string>;
}

export interface SecretList {
  apiVersion: string;
  kind: 'SecretList';
  metadata: ListMeta;
  items: Secret[];
}

// Namespace types
export interface Namespace {
  apiVersion: string;
  kind: 'Namespace';
  metadata: ObjectMeta;
  spec?: NamespaceSpec;
  status?: NamespaceStatus;
}

export interface NamespaceSpec {
  finalizers?: string[];
}

export interface NamespaceStatus {
  phase: 'Active' | 'Terminating';
}

export interface NamespaceList {
  apiVersion: string;
  kind: 'NamespaceList';
  metadata: ListMeta;
  items: Namespace[];
}

// Node types
export interface Node {
  apiVersion: string;
  kind: 'Node';
  metadata: ObjectMeta;
  spec: NodeSpec;
  status: NodeStatus;
}

export interface NodeSpec {
  podCIDR?: string;
  unschedulable?: boolean;
  taints?: Taint[];
}

export interface Taint {
  key: string;
  value?: string;
  effect: 'NoSchedule' | 'PreferNoSchedule' | 'NoExecute';
}

export interface NodeStatus {
  conditions?: NodeCondition[];
  addresses?: NodeAddress[];
  nodeInfo?: NodeSystemInfo;
  capacity?: Record<string, string>;
  allocatable?: Record<string, string>;
}

export interface NodeCondition {
  type: string;
  status: string;
  reason?: string;
  message?: string;
}

export interface NodeAddress {
  type: string;
  address: string;
}

export interface NodeSystemInfo {
  machineID: string;
  systemUUID: string;
  bootID: string;
  kernelVersion: string;
  osImage: string;
  containerRuntimeVersion: string;
  kubeletVersion: string;
  kubeProxyVersion: string;
  operatingSystem: string;
  architecture: string;
}

export interface NodeList {
  apiVersion: string;
  kind: 'NodeList';
  metadata: ListMeta;
  items: Node[];
}

// PersistentVolume types
export interface PersistentVolume {
  apiVersion: string;
  kind: 'PersistentVolume';
  metadata: ObjectMeta;
  spec: PersistentVolumeSpec;
  status?: PersistentVolumeStatus;
}

export interface PersistentVolumeSpec {
  capacity: Record<string, string>;
  accessModes: string[];
  persistentVolumeReclaimPolicy?: string;
  storageClassName?: string;
  claimRef?: {
    namespace: string;
    name: string;
  };
}

export interface PersistentVolumeStatus {
  phase: 'Available' | 'Bound' | 'Released' | 'Failed';
}

export interface PersistentVolumeList {
  apiVersion: string;
  kind: 'PersistentVolumeList';
  metadata: ListMeta;
  items: PersistentVolume[];
}

// PersistentVolumeClaim types
export interface PersistentVolumeClaim {
  apiVersion: string;
  kind: 'PersistentVolumeClaim';
  metadata: ObjectMeta;
  spec: PersistentVolumeClaimSpec;
  status?: PersistentVolumeClaimStatus;
}

export interface PersistentVolumeClaimSpec {
  accessModes: string[];
  resources: {
    requests: Record<string, string>;
  };
  storageClassName?: string;
  volumeName?: string;
}

export interface PersistentVolumeClaimStatus {
  phase: 'Pending' | 'Bound' | 'Lost';
  accessModes?: string[];
  capacity?: Record<string, string>;
}

export interface PersistentVolumeClaimList {
  apiVersion: string;
  kind: 'PersistentVolumeClaimList';
  metadata: ListMeta;
  items: PersistentVolumeClaim[];
}

// Event types
export interface Event {
  apiVersion: string;
  kind: 'Event';
  metadata: ObjectMeta;
  involvedObject: {
    kind: string;
    namespace?: string;
    name: string;
    uid: string;
  };
  reason: string;
  message: string;
  type: 'Normal' | 'Warning';
  count?: number;
  firstTimestamp?: string;
  lastTimestamp?: string;
  source?: {
    component?: string;
    host?: string;
  };
}

export interface EventList {
  apiVersion: string;
  kind: 'EventList';
  metadata: ListMeta;
  items: Event[];
}

// Ingress types (networking.k8s.io/v1)
export interface Ingress {
  apiVersion: string;
  kind: 'Ingress';
  metadata: ObjectMeta;
  spec: IngressSpec;
  status?: IngressStatus;
}

export interface IngressSpec {
  ingressClassName?: string;
  defaultBackend?: IngressBackend;
  rules?: IngressRule[];
  tls?: IngressTLS[];
}

export interface IngressBackend {
  service?: {
    name: string;
    port: { number?: number; name?: string };
  };
}

export interface IngressRule {
  host?: string;
  http?: {
    paths: {
      path?: string;
      pathType: string;
      backend: IngressBackend;
    }[];
  };
}

export interface IngressTLS {
  hosts?: string[];
  secretName?: string;
}

export interface IngressStatus {
  loadBalancer?: {
    ingress?: { ip?: string; hostname?: string }[];
  };
}

export interface IngressList {
  apiVersion: string;
  kind: 'IngressList';
  metadata: ListMeta;
  items: Ingress[];
}

// DaemonSet types (apps/v1)
export interface DaemonSet {
  apiVersion: string;
  kind: 'DaemonSet';
  metadata: ObjectMeta;
  spec: DaemonSetSpec;
  status: DaemonSetStatus;
}

export interface DaemonSetSpec {
  selector: LabelSelector;
  template: PodTemplateSpec;
  updateStrategy?: {
    type: 'RollingUpdate' | 'OnDelete';
  };
}

export interface DaemonSetStatus {
  currentNumberScheduled: number;
  desiredNumberScheduled: number;
  numberReady: number;
  numberAvailable?: number;
  numberUnavailable?: number;
  updatedNumberScheduled?: number;
}

export interface DaemonSetList {
  apiVersion: string;
  kind: 'DaemonSetList';
  metadata: ListMeta;
  items: DaemonSet[];
}

// StatefulSet types (apps/v1)
export interface StatefulSet {
  apiVersion: string;
  kind: 'StatefulSet';
  metadata: ObjectMeta;
  spec: StatefulSetSpec;
  status: StatefulSetStatus;
}

export interface StatefulSetSpec {
  replicas: number;
  selector: LabelSelector;
  template: PodTemplateSpec;
  serviceName: string;
}

export interface StatefulSetStatus {
  replicas: number;
  readyReplicas?: number;
  currentReplicas?: number;
  updatedReplicas?: number;
  availableReplicas?: number;
}

export interface StatefulSetList {
  apiVersion: string;
  kind: 'StatefulSetList';
  metadata: ListMeta;
  items: StatefulSet[];
}

// Job types (batch/v1)
export interface Job {
  apiVersion: string;
  kind: 'Job';
  metadata: ObjectMeta;
  spec: JobSpec;
  status: JobStatus;
}

export interface JobSpec {
  parallelism?: number;
  completions?: number;
  backoffLimit?: number;
  template: PodTemplateSpec;
}

export interface JobStatus {
  conditions?: JobCondition[];
  startTime?: string;
  completionTime?: string;
  active?: number;
  succeeded?: number;
  failed?: number;
}

export interface JobCondition {
  type: string;
  status: string;
  reason?: string;
  message?: string;
}

export interface JobList {
  apiVersion: string;
  kind: 'JobList';
  metadata: ListMeta;
  items: Job[];
}

// CronJob types (batch/v1)
export interface CronJob {
  apiVersion: string;
  kind: 'CronJob';
  metadata: ObjectMeta;
  spec: CronJobSpec;
  status: CronJobStatus;
}

export interface CronJobSpec {
  schedule: string;
  concurrencyPolicy?: 'Allow' | 'Forbid' | 'Replace';
  suspend?: boolean;
  jobTemplate: {
    spec: JobSpec;
  };
}

export interface CronJobStatus {
  active?: { name: string; namespace: string }[];
  lastScheduleTime?: string;
  lastSuccessfulTime?: string;
}

export interface CronJobList {
  apiVersion: string;
  kind: 'CronJobList';
  metadata: ListMeta;
  items: CronJob[];
}
