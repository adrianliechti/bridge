import type { Section, SectionData } from '../adapters/types';
import { StatusCardsSection, GaugesSection, PodGridSection, ConditionsSection } from './StatusSection';
import { ContainersSection } from './ContainerSection';
import { VolumesSection } from './VolumeSection';
import { CapacityBarsSection, TaintsSection, NodeSelectorSection } from './NodeSection';
import { RelatedReplicaSetsSection, RelatedPVCsSection, RelatedJobsSection } from './RelatedSection';
import { VolumeClaimTemplatesSection, ScheduleSection, JobProgressSection, TimelineSection } from './JobSection';
import { InfoGridSection, LabelsSection, ContainerImagesSection, AddressesSection } from './InfoSection';
import { ContainerMetricsSection, WorkloadMetricsSection, NodeMetricsSection } from './MetricsSection';

export function SectionRenderer({ section }: { section: Section }) {
  const { title, data } = section;
  const content = renderSectionData(data);

  // Don't render empty sections
  if (content === null) return null;

  if (!title) return <>{content}</>;

  return (
    <div>
      <h5 className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2">
        {title}
      </h5>
      {content}
    </div>
  );
}

function renderSectionData(data: SectionData): React.ReactNode {
  switch (data.type) {
    case 'status-cards':
      return <StatusCardsSection items={data.items} />;

    case 'gauges':
      return <GaugesSection items={data.items} podGrid={data.showPodGrid} />;

    case 'pod-grid':
      return <PodGridSection data={data.data} />;

    case 'conditions':
      return <ConditionsSection items={data.items} />;

    case 'info-grid':
      return <InfoGridSection items={data.items} columns={data.columns} />;

    case 'containers':
      return <ContainersSection items={data.items} metricsLoader={data.metricsLoader} />;

    case 'volumes':
      return <VolumesSection items={data.items} />;

    case 'labels':
      return <LabelsSection labels={data.labels} title={data.title} />;

    case 'capacity-bars':
      return <CapacityBarsSection items={data.items} />;

    case 'taints':
      return <TaintsSection items={data.items} />;

    case 'container-images':
      return <ContainerImagesSection containers={data.containers} />;

    case 'node-selector':
      return <NodeSelectorSection selector={data.selector} />;

    case 'related-replicasets':
      return <RelatedReplicaSetsSection loader={data.loader} title={data.title} />;

    case 'related-pvcs':
      return <RelatedPVCsSection loader={data.loader} title={data.title} />;

    case 'related-jobs':
      return <RelatedJobsSection loader={data.loader} title={data.title} />;

    case 'volume-claim-templates':
      return <VolumeClaimTemplatesSection items={data.items} />;

    case 'schedule':
      return <ScheduleSection schedule={data.schedule} description={data.description} />;

    case 'job-progress':
      return <JobProgressSection {...data} />;

    case 'timeline':
      return <TimelineSection startTime={data.startTime} completionTime={data.completionTime} />;

    case 'addresses':
      return <AddressesSection addresses={data.addresses} />;

    case 'container-metrics':
      return <ContainerMetricsSection loader={data.loader} title={data.title} />;

    case 'workload-metrics':
      return <WorkloadMetricsSection loader={data.loader} title={data.title} />;

    case 'node-metrics':
      return <NodeMetricsSection loader={data.loader} title={data.title} />;

    case 'custom':
      return data.render();

    default:
      return null;
  }
}
