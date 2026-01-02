// Panels - Extracted components from ResourceVisualizer and ResourcePanel

// Export types
export type {
  StatusLevel,
  GaugeColor,
  GridIcon,
  StatusCardData,
  GaugeData,
  GridData,
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
  EnvVarData,
  EnvFromData,
  MetricsData,
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
export { NodeMetricsSection } from './MetricsSection';
export { ResourceQuotaSection } from './ResourceQuotaSection';
export { SectionRenderer } from './SectionRenderer';

// Manifest components
export { MetadataView } from './MetadataView';
export { HelmReleaseView } from './HelmReleaseView';

// Log viewer
export { LogViewer, type LogEntry, type LogViewerProps } from './LogViewer';
export { DockerConfigView } from './DockerConfigView';
export { CertificateView, PrivateKeyView, PublicKeyView, CsrView, detectPemType } from './CertificateView';
