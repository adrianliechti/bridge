import type { ResourceType } from './Sidebar';
import { PodsTable } from './PodsTable';
import { ServicesTable } from './ServicesTable';
import { DeploymentsTable } from './DeploymentsTable';
import { ReplicaSetsTable } from './ReplicaSetsTable';
import { DaemonSetsTable } from './DaemonSetsTable';
import { StatefulSetsTable } from './StatefulSetsTable';
import { JobsTable } from './JobsTable';
import { CronJobsTable } from './CronJobsTable';
import { ConfigMapsTable } from './ConfigMapsTable';
import { SecretsTable } from './SecretsTable';
import { IngressesTable } from './IngressesTable';
import { NamespacesTable } from './NamespacesTable';
import { NodesTable } from './NodesTable';
import { PersistentVolumesTable } from './PersistentVolumesTable';
import { PersistentVolumeClaimsTable } from './PersistentVolumeClaimsTable';
import { EventsTable } from './EventsTable';

interface MainContentProps {
  resourceType: ResourceType;
  namespace?: string;
}

const resourceTitles: Record<ResourceType, string> = {
  pods: 'Pods',
  services: 'Services',
  deployments: 'Deployments',
  replicasets: 'ReplicaSets',
  daemonsets: 'DaemonSets',
  statefulsets: 'StatefulSets',
  jobs: 'Jobs',
  cronjobs: 'CronJobs',
  configmaps: 'ConfigMaps',
  secrets: 'Secrets',
  ingresses: 'Ingresses',
  namespaces: 'Namespaces',
  nodes: 'Nodes',
  persistentvolumes: 'Persistent Volumes',
  persistentvolumeclaims: 'Persistent Volume Claims',
  events: 'Events',
};

export function MainContent({ resourceType, namespace }: MainContentProps) {
  const renderTable = () => {
    switch (resourceType) {
      case 'pods':
        return <PodsTable namespace={namespace} />;
      case 'services':
        return <ServicesTable namespace={namespace} />;
      case 'deployments':
        return <DeploymentsTable namespace={namespace} />;
      case 'replicasets':
        return <ReplicaSetsTable namespace={namespace} />;
      case 'daemonsets':
        return <DaemonSetsTable namespace={namespace} />;
      case 'statefulsets':
        return <StatefulSetsTable namespace={namespace} />;
      case 'jobs':
        return <JobsTable namespace={namespace} />;
      case 'cronjobs':
        return <CronJobsTable namespace={namespace} />;
      case 'configmaps':
        return <ConfigMapsTable namespace={namespace} />;
      case 'secrets':
        return <SecretsTable namespace={namespace} />;
      case 'ingresses':
        return <IngressesTable namespace={namespace} />;
      case 'namespaces':
        return <NamespacesTable />;
      case 'nodes':
        return <NodesTable />;
      case 'persistentvolumes':
        return <PersistentVolumesTable />;
      case 'persistentvolumeclaims':
        return <PersistentVolumeClaimsTable namespace={namespace} />;
      case 'events':
        return <EventsTable namespace={namespace} />;
      default:
        return <div>Unknown resource type</div>;
    }
  };

  return (
    <main className="main-content">
      <header className="content-header">
        <h2>{resourceTitles[resourceType]}</h2>
        {namespace && <span className="namespace-badge">Namespace: {namespace}</span>}
      </header>
      <section className="content-body">{renderTable()}</section>
    </main>
  );
}
