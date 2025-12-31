// Panels - Extracted components from ResourceVisualizer and ResourcePanel

// Export types
export type {
  StatusLevel,
  GaugeColor,
  GridIcon,
  PodGridIcon,
  StatusCardData,
  GaugeData,
  GridData,
  PodGridData,
  InfoRowData,
  ContainerData,
  VolumeData,
  CapacityBarData,
  TaintData,
  RelatedResourceData,
  JobData,
  ReplicaSetData,
  PVCData,
  VolumeClaimTemplateData,
  MetricsData,
  NodeMetricsData,
  ResourceQuotaData,
  SectionData,
  Section,
  ResourceSections,
  ActionVariant,
  ResourceAction,
} from './types';

// Action components
export { ActionBar } from './ActionBar';

// Section components
export { StatusCardsSection, GaugesSection, PodGridSection } from './StatusSection';
export { ContainersSection, ContainerCard } from './ContainerSection';
export { VolumesSection, VolumeCard } from './VolumeSection';
export { CapacityBarsSection, TaintsSection } from './NodeSection';
export { RelatedReplicaSetsSection, RelatedPVCsSection, RelatedJobsSection } from './RelatedSection';
export { VolumeClaimTemplatesSection, ScheduleSection, JobProgressSection, TimelineSection } from './JobSection';
export { InfoGridSection, LabelsSection, ContainerImagesSection, AddressesSection } from './InfoSection';
export { MetricsProgressBar, NodeMetricsSection } from './MetricsSection';
export { ResourceQuotaSection } from './ResourceQuotaSection';
export { SectionRenderer } from './SectionRenderer';

// Manifest components
export { MetadataView } from './MetadataView';
export { HelmReleaseView } from './HelmReleaseView';
export { DockerConfigView } from './DockerConfigView';
export { CertificateView, PrivateKeyView, PublicKeyView, CsrView, detectPemType } from './CertificateView';
