// ResourceVisualizer - Unified renderer for all resource types
//
// This component renders the sections produced by resource adapters.
// It provides a consistent look and feel across all resource kinds.

import { useState, useEffect } from 'react';
import { 
  Box, 
  Database, 
  Server, 
  HardDrive, 
  Calendar,
  Layers,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Tag,
  Cpu,
  Activity,
  KeyRound,
  Settings,
  FolderOpen,
  FolderSymlink,
  Network,
  Puzzle,
  FileDown,
} from 'lucide-react';
import type { 
  Section, 
  SectionData,
  StatusCardData,
  GaugeData,
  ConditionData,
  PodGridData,
  InfoRowData,
  ContainerData,
  VolumeData,
  CapacityBarData,
  TaintData,
  ReplicaSetData,
  PVCData,
  JobData,
  VolumeClaimTemplateData,
} from './resources/types';
import { adaptResource } from './resources';
import type { KubernetesResource } from '../api/kubernetes';
import { formatTimeAgo } from './resources/utils';

// ============================================
// MAIN COMPONENT
// ============================================

interface ResourceVisualizerProps {
  resource: KubernetesResource;
  namespace?: string;
}

export function ResourceVisualizer({ resource, namespace }: ResourceVisualizerProps) {
  const sections = adaptResource(resource, namespace);

  if (!sections || sections.sections.length === 0) {
    return (
      <div className="text-gray-500 text-sm">
        No visualization available for {resource.kind}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sections.sections.map(section => (
        <SectionRenderer key={section.id} section={section} />
      ))}
    </div>
  );
}

// ============================================
// SECTION RENDERER
// ============================================

function SectionRenderer({ section }: { section: Section }) {
  const { title, data } = section;
  const content = renderSectionData(data);

  // Don't render empty sections
  if (content === null) return null;

  if (!title) return <>{content}</>;

  return (
    <div>
      <h5 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
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
      return <ContainersSection items={data.items} />;

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
      return <RelatedReplicaSetsSection loader={data.loader} />;

    case 'related-pvcs':
      return <RelatedPVCsSection loader={data.loader} />;

    case 'related-jobs':
      return <RelatedJobsSection loader={data.loader} />;

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

    case 'custom':
      return data.render();

    default:
      return null;
  }
}

// ============================================
// SECTION COMPONENTS
// ============================================

function StatusCardsSection({ items }: { items: StatusCardData[] }) {
  const statusColors = {
    success: 'text-emerald-400',
    warning: 'text-amber-400',
    error: 'text-red-400',
    neutral: 'text-gray-100',
  };

  return (
    <div className="grid grid-cols-2 gap-3">
      {items.map((item, i) => (
        <div key={i} className="bg-gray-100 dark:bg-gray-800 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">{item.label}</div>
          <div className={`text-sm font-medium flex items-center gap-2 ${statusColors[item.status || 'neutral']}`}>
            {item.icon}
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function GaugesSection({ items, podGrid }: { items: GaugeData[]; podGrid?: PodGridData }) {
  const colorClasses: Record<string, string> = {
    emerald: 'text-emerald-400',
    blue: 'text-blue-400',
    cyan: 'text-cyan-400',
    purple: 'text-purple-400',
    amber: 'text-amber-400',
  };
  const bgClasses: Record<string, string> = {
    emerald: 'bg-emerald-500',
    blue: 'bg-blue-500',
    cyan: 'bg-cyan-500',
    purple: 'bg-purple-500',
    amber: 'bg-amber-500',
  };

  return (
    <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-3">
      <div className="flex items-center gap-4 mb-3">
        {items.map((item, i) => {
          const percentage = item.total > 0 ? Math.min((item.current / item.total) * 100, 100) : 0;
          return (
            <div key={i} className="flex-1">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-gray-500">{item.label}</span>
                <span className={colorClasses[item.color]}>{item.current}/{item.total}</span>
              </div>
              <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
                <div className={`h-full ${bgClasses[item.color]}`} style={{ width: `${percentage}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      {podGrid && <PodGridSection data={podGrid} />}
    </div>
  );
}

function PodGridSection({ data }: { data: PodGridData }) {
  const IconComponent = data.icon === 'database' ? Database : data.icon === 'server' ? Server : Box;

  return (
    <div className="flex flex-wrap gap-1">
      {Array.from({ length: data.total }).map((_, i) => {
        const isReady = i < data.ready;
        const isAvailable = data.available !== undefined ? i < data.available : isReady;
        const isCurrent = data.current !== undefined ? i < data.current : isAvailable;
        const title = data.podTitles?.[i] ?? `Pod ${i}`;

        return (
          <div
            key={i}
            className={`${data.showOrdinal ? 'w-8 h-8' : 'w-6 h-6'} rounded flex flex-col items-center justify-center ${
              isReady ? 'bg-emerald-500/20 border border-emerald-500/50' :
              isAvailable ? 'bg-cyan-500/20 border border-cyan-500/50' :
              isCurrent ? 'bg-amber-500/20 border border-amber-500/50' :
              'bg-gray-700/50 border border-gray-600'
            }`}
            title={`${title}: ${isReady ? 'Ready' : isAvailable ? 'Available' : isCurrent ? 'Current' : 'Pending'}`}
          >
            <IconComponent size={data.showOrdinal ? 10 : 12} className={
              isReady ? 'text-emerald-400' :
              isAvailable ? 'text-cyan-400' :
              isCurrent ? 'text-amber-400' :
              'text-gray-500'
            } />
            {data.showOrdinal && (
              <span className={`text-[9px] ${
                isReady ? 'text-emerald-400' :
                isAvailable ? 'text-cyan-400' :
                isCurrent ? 'text-amber-400' :
                'text-gray-500'
              }`}>{i}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ConditionsSection({ items }: { items: ConditionData[] }) {
  // Only show problematic conditions (not positive)
  const problematicConditions = items.filter(c => !c.isPositive);
  
  if (problematicConditions.length === 0) {
    return null;
  }
  
  return (
    <div className="space-y-1">
      {problematicConditions.map((condition, i) => (
        <div 
          key={i} 
          className="flex items-start gap-2 text-xs px-2 py-1.5 rounded bg-amber-500/10 border border-amber-500/20"
        >
          <AlertTriangle size={12} className="text-amber-400 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <div className="text-amber-300 font-medium">{condition.type}</div>
            {condition.reason && (
              <div className="text-amber-400/70">{condition.reason}</div>
            )}
            {condition.message && (
              <div className="text-gray-400 text-[10px] mt-0.5 wrap-break-word">{condition.message}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function InfoGridSection({ items, columns = 2 }: { items: InfoRowData[]; columns?: 1 | 2 }) {
  const filteredItems = items.filter(item => item.value !== undefined && item.value !== null);
  
  return (
    <div className={`bg-gray-900/50 rounded-lg p-3 grid gap-2 text-xs ${
      columns === 2 ? 'grid-cols-2' : 'grid-cols-1'
    }`}>
      {filteredItems.map((item, i) => (
        <div key={i} className="overflow-hidden">
          <span className="text-gray-500">{item.label}:</span>{' '}
          <span className={item.color || 'text-gray-300'}>{item.value}</span>
        </div>
      ))}
    </div>
  );
}

function ContainersSection({ items }: { items: ContainerData[] }) {
  if (items.length === 0) return null;
  
  return (
    <div className="space-y-2">
      {items.map((container) => (
        <ContainerCard key={container.name} container={container} />
      ))}
    </div>
  );
}

function ContainerCard({ container }: { container: ContainerData }) {
  const [expanded, setExpanded] = useState(false);

  const stateInfo = getContainerStateInfo(container.state, container.stateReason);

  return (
    <div className={`border rounded-lg overflow-hidden ${stateInfo.borderClass}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-gray-800/30 transition-colors"
      >
        {expanded ? (
          <ChevronDown size={14} className="text-gray-500" />
        ) : (
          <ChevronRight size={14} className="text-gray-500" />
        )}
        <Box size={16} className={stateInfo.iconClass} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-100">{container.name}</span>
            <span className={`px-1.5 py-0.5 rounded text-xs ${stateInfo.badgeClass}`}>
              {stateInfo.label}
            </span>
          </div>
          <div className="text-xs text-gray-500 truncate">{container.image}</div>
        </div>
        {(container.restartCount ?? 0) > 0 && (
          <div className="text-xs text-amber-400">
            {container.restartCount} restarts
          </div>
        )}
      </button>

      {expanded && (
        <div className="border-t border-gray-800 p-3 space-y-3">
          {/* Image */}
          <div>
            <div className="text-xs text-gray-500 mb-1">Image</div>
            <div className="text-xs text-cyan-400 break-all">{container.image}</div>
          </div>

          {/* Command & Args */}
          {(container.command || container.args) && (
            <div>
              <div className="text-xs text-gray-500 mb-1">Command</div>
              <code className="text-xs text-gray-300 bg-gray-800 px-2 py-1 rounded block">
                {[...(container.command || []), ...(container.args || [])].join(' ')}
              </code>
            </div>
          )}

          {/* Ports */}
          {container.ports && container.ports.length > 0 && (
            <div>
              <div className="text-xs text-gray-500 mb-1">Ports</div>
              <div className="flex flex-wrap gap-1">
                {container.ports.map((port, i) => (
                  <span key={i} className="text-xs bg-gray-800 px-2 py-1 rounded">
                    {port.containerPort}/{port.protocol || 'TCP'}
                    {port.name && <span className="text-gray-500 ml-1">({port.name})</span>}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Resources */}
          {container.resources && (
            <div className="grid grid-cols-2 gap-2">
              {container.resources.requests && (
                <div>
                  <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                    <Cpu size={10} /> Requests
                  </div>
                  <div className="text-xs space-y-0.5">
                    {Object.entries(container.resources.requests).map(([k, v]) => (
                      <div key={k} className="text-gray-400">
                        <span className="text-gray-500">{k}:</span> {v}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {container.resources.limits && (
                <div>
                  <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                    <Activity size={10} /> Limits
                  </div>
                  <div className="text-xs space-y-0.5">
                    {Object.entries(container.resources.limits).map(([k, v]) => (
                      <div key={k} className="text-gray-400">
                        <span className="text-gray-500">{k}:</span> {v}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Volume Mounts */}
          {container.mounts && container.mounts.length > 0 && (
            <div>
              <div className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                <HardDrive size={10} /> Volume Mounts
              </div>
              <div className="text-xs space-y-1.5 ml-1">
                {container.mounts.map((mount, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-purple-400 truncate max-w-[140px]" title={mount.name}>{mount.name}</span>
                    <span className="text-gray-600">→</span>
                    <span className="text-cyan-400 font-mono truncate flex-1" title={mount.mountPath}>{mount.mountPath}</span>
                    {mount.readOnly && <span className="text-amber-400 text-[10px] px-1 py-0.5 bg-amber-500/10 rounded">(ro)</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function getContainerStateInfo(state?: string, reason?: string) {
  if (state === 'running') {
    return {
      label: 'Running',
      borderClass: 'border-emerald-500/30 bg-emerald-500/5',
      badgeClass: 'bg-emerald-500/20 text-emerald-400',
      iconClass: 'text-emerald-400',
    };
  }
  if (state === 'waiting') {
    const isError = reason === 'CrashLoopBackOff' || reason === 'Error';
    return {
      label: reason || 'Waiting',
      borderClass: isError ? 'border-red-500/30 bg-red-500/5' : 'border-amber-500/30 bg-amber-500/5',
      badgeClass: isError ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400',
      iconClass: isError ? 'text-red-400' : 'text-amber-400',
    };
  }
  if (state === 'terminated') {
    return {
      label: reason || 'Terminated',
      borderClass: 'border-gray-700 bg-gray-900/50',
      badgeClass: 'bg-gray-700 text-gray-400',
      iconClass: 'text-gray-400',
    };
  }
  return {
    label: 'Unknown',
    borderClass: 'border-gray-700 bg-gray-900/50',
    badgeClass: 'bg-gray-700 text-gray-400',
    iconClass: 'text-gray-400',
  };
}

function VolumesSection({ items }: { items: VolumeData[] }) {
  if (items.length === 0) return null;
  
  return (
    <div className="space-y-2">
      {items.map((volume) => (
        <VolumeCard key={volume.name} volume={volume} />
      ))}
    </div>
  );
}

function VolumeCard({ volume }: { volume: VolumeData }) {
  const [expanded, setExpanded] = useState(false);

  const typeStyles: Record<string, string> = {
    'ConfigMap': 'border-blue-500/30 bg-blue-500/5',
    'Secret': 'border-amber-500/30 bg-amber-500/5',
    'PVC': 'border-emerald-500/30 bg-emerald-500/5',
    'EmptyDir': 'border-gray-500/30 bg-gray-500/5',
    'HostPath': 'border-red-500/30 bg-red-500/5',
    'Projected': 'border-purple-500/30 bg-purple-500/5',
    'DownwardAPI': 'border-cyan-500/30 bg-cyan-500/5',
    'NFS': 'border-orange-500/30 bg-orange-500/5',
    'CSI': 'border-indigo-500/30 bg-indigo-500/5',
  };

  const typeIcons: Record<string, React.ReactNode> = {
    'ConfigMap': <Settings size={14} className="text-blue-400" />,
    'Secret': <KeyRound size={14} className="text-amber-400" />,
    'PVC': <Database size={14} className="text-emerald-400" />,
    'EmptyDir': <FolderOpen size={14} className="text-gray-400" />,
    'HostPath': <FolderSymlink size={14} className="text-red-400" />,
    'Projected': <Layers size={14} className="text-purple-400" />,
    'DownwardAPI': <FileDown size={14} className="text-cyan-400" />,
    'NFS': <Network size={14} className="text-orange-400" />,
    'CSI': <Puzzle size={14} className="text-indigo-400" />,
  };

  const typeBadgeStyles: Record<string, string> = {
    'ConfigMap': 'bg-blue-500/20 text-blue-400',
    'Secret': 'bg-amber-500/20 text-amber-400',
    'PVC': 'bg-emerald-500/20 text-emerald-400',
    'EmptyDir': 'bg-gray-500/20 text-gray-400',
    'HostPath': 'bg-red-500/20 text-red-400',
    'Projected': 'bg-purple-500/20 text-purple-400',
    'DownwardAPI': 'bg-cyan-500/20 text-cyan-400',
    'NFS': 'bg-orange-500/20 text-orange-400',
    'CSI': 'bg-indigo-500/20 text-indigo-400',
  };

  return (
    <div className={`border rounded-lg overflow-hidden ${typeStyles[volume.type] || 'border-gray-700 bg-gray-900/50'}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-gray-800/30 transition-colors"
      >
        {expanded ? (
          <ChevronDown size={14} className="text-gray-500" />
        ) : (
          <ChevronRight size={14} className="text-gray-500" />
        )}
        {typeIcons[volume.type] || <HardDrive size={14} className="text-gray-400" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-100">{volume.name}</span>
          </div>
          <div className="text-xs text-gray-500 truncate">
            {volume.source && <span className="text-cyan-400/70">{volume.source}</span>}
            {volume.mounts.length > 0 && (
              <span className="ml-2">→ {volume.mounts.map(m => m.mountPath).join(', ')}</span>
            )}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-800 p-3 space-y-3">
          {/* Source Info */}
          <div>
            <div className="text-xs text-gray-500 mb-1">Source</div>
            <div className="text-xs">
              <span className={`px-1.5 py-0.5 rounded ${typeBadgeStyles[volume.type] || 'bg-gray-700 text-gray-400'}`}>
                {volume.type}
              </span>
              {volume.source && (
                <span className="ml-2 text-cyan-400">{volume.source}</span>
              )}
            </div>
            {/* Extra source details */}
            {volume.extra && Object.keys(volume.extra).length > 0 && (
              <div className="mt-2 text-xs space-y-1">
                {Object.entries(volume.extra).map(([key, value]) => (
                  <div key={key} className="text-gray-400">
                    <span className="text-gray-500">{key}:</span> <span className="text-gray-300">{value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Mount Points */}
          {volume.mounts.length > 0 && (
            <div>
              <div className="text-xs text-gray-500 mb-1">Mount Points</div>
              <div className="space-y-2">
                {volume.mounts.map((mount, i) => (
                  <div key={i} className="text-xs bg-gray-900/50 rounded p-2">
                    <div className="flex items-center gap-2">
                      <Box size={10} className="text-blue-400" />
                      <span className="text-gray-300">{mount.container}</span>
                      <span className="text-gray-600">→</span>
                      <span className="text-cyan-400 font-mono">{mount.mountPath}</span>
                      {mount.readOnly && (
                        <span className="px-1 py-0.5 rounded bg-amber-500/20 text-amber-400 text-[10px]">read-only</span>
                      )}
                    </div>
                    {mount.subPath && (
                      <div className="ml-4 mt-1 text-gray-500">
                        <span className="text-gray-600">subPath:</span> <span className="text-purple-400">{mount.subPath}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LabelsSection({ labels, title = 'Labels' }: { labels: Record<string, string>; title?: string }) {
  const entries = Object.entries(labels);
  if (entries.length === 0) return null;

  // Sort important labels first
  const importantPrefixes = [
    'node-role.kubernetes.io/',
    'kubernetes.io/os',
    'kubernetes.io/arch',
    'node.kubernetes.io/instance-type',
    'topology.kubernetes.io/',
  ];

  const sortedEntries = [...entries].sort((a, b) => {
    const aImportant = importantPrefixes.some(p => a[0].startsWith(p));
    const bImportant = importantPrefixes.some(p => b[0].startsWith(p));
    if (aImportant && !bImportant) return -1;
    if (!aImportant && bImportant) return 1;
    return 0;
  });

  return (
    <div>
      <h5 className="flex items-center gap-2 text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
        <Tag size={12} />
        {title}
      </h5>
      <table className="w-full text-xs table-fixed">
        <colgroup>
          <col className="w-[40%]" />
          <col className="w-[60%]" />
        </colgroup>
        <tbody>
          {sortedEntries.map(([key, value], index) => {
            const isImportant = importantPrefixes.some(p => key.startsWith(p));
            return (
              <tr key={key} className={index % 2 === 0 ? 'bg-gray-50 dark:bg-gray-800/30' : ''}>
                <td className={`py-1.5 px-2 truncate ${isImportant ? 'text-blue-600 dark:text-blue-400' : 'text-sky-600 dark:text-sky-400'}`} title={key}>
                  {key}
                </td>
                <td className="py-1.5 px-2 text-emerald-600 dark:text-emerald-400 truncate" title={value}>
                  {value}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CapacityBarsSection({ items }: { items: CapacityBarData[] }) {
  if (items.length === 0) return null;
  
  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i} className="bg-gray-900/50 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-sm text-gray-300">
              {item.icon}
              {item.label}
            </div>
            <div className="text-xs">
              <span className="text-cyan-400">{item.allocatable}</span>
              <span className="text-gray-500"> / </span>
              <span className="text-gray-400">{item.capacity}</span>
            </div>
          </div>
          <div className="text-[10px] text-gray-500 flex justify-between">
            <span>Allocatable</span>
            <span>Capacity</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function TaintsSection({ items }: { items: TaintData[] }) {
  if (items.length === 0) return null;
  
  const effectColors: Record<string, string> = {
    'NoSchedule': 'bg-red-500/20 text-red-400 border-red-500/30',
    'PreferNoSchedule': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    'NoExecute': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  };

  return (
    <div className="flex flex-wrap gap-1">
      {items.map((taint, i) => (
        <span 
          key={i} 
          className="text-xs bg-gray-200 dark:bg-gray-700 px-2 py-0.5 rounded flex items-center gap-1"
          title={`${taint.key}=${taint.value || ''}:${taint.effect}`}
        >
          <span className="text-purple-600 dark:text-purple-400">{taint.key}</span>
          {taint.value && (
            <>
              <span className="text-gray-400">=</span>
              <span className="text-cyan-600 dark:text-cyan-400">{taint.value}</span>
            </>
          )}
          <span className={`ml-1 px-1 py-0.5 rounded text-[10px] border ${effectColors[taint.effect] ?? 'bg-gray-700 text-gray-300'}`}>
            {taint.effect}
          </span>
        </span>
      ))}
    </div>
  );
}

function ContainerImagesSection({ containers }: { containers: Array<{ name: string; image?: string }> }) {
  return (
    <div className="space-y-1">
      {containers.map(container => (
        <div key={container.name} className="text-xs bg-gray-900/50 px-2 py-1.5 rounded flex items-center gap-2">
          <Box size={12} className="text-blue-400" />
          <span className="text-gray-300">{container.name}:</span>
          <span className="text-cyan-400 truncate">{container.image}</span>
        </div>
      ))}
    </div>
  );
}

function NodeSelectorSection({ selector }: { selector: Record<string, string> }) {
  return (
    <div className="space-y-1">
      {Object.entries(selector).map(([key, value]) => (
        <div key={key} className="text-xs bg-gray-900/50 px-2 py-1.5 rounded">
          <span className="text-purple-400">{key}</span>
          <span className="text-gray-600 mx-1">=</span>
          <span className="text-cyan-400">{value}</span>
        </div>
      ))}
    </div>
  );
}

// Async section components

function RelatedReplicaSetsSection({ loader }: { loader: () => Promise<ReplicaSetData[]> }) {
  const [items, setItems] = useState<ReplicaSetData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loader().then(setItems).finally(() => setLoading(false));
  }, [loader]);

  if (loading) {
    return <div className="text-xs text-gray-500">Loading ReplicaSets...</div>;
  }

  if (items.length === 0) {
    return <div className="text-xs text-gray-500">No ReplicaSets found</div>;
  }

  return (
    <div className="space-y-2">
      {items.map(rs => (
        <div key={rs.name} className={`border rounded-lg p-2 ${
          rs.isCurrent 
            ? 'border-blue-500/30 bg-blue-500/5' 
            : 'border-gray-700 bg-gray-900/50 opacity-60'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers size={14} className={rs.isCurrent ? 'text-blue-400' : 'text-gray-500'} />
              <span className="text-sm text-gray-100 truncate max-w-50" title={rs.name}>
                {rs.name}
              </span>
              {rs.revision && (
                <span className="text-xs bg-gray-700 px-1.5 py-0.5 rounded text-gray-400">
                  rev {rs.revision}
                </span>
              )}
            </div>
            <div className="text-xs">
              <span className={rs.readyReplicas === rs.replicas ? 'text-emerald-400' : 'text-amber-400'}>
                {rs.readyReplicas}/{rs.replicas}
              </span>
              <span className="text-gray-500 ml-1">ready</span>
            </div>
          </div>
          {rs.images.length > 0 && (
            <div className="mt-1 text-xs text-cyan-400/70 truncate">
              {rs.images.join(', ')}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function RelatedPVCsSection({ loader }: { loader: () => Promise<PVCData[]> }) {
  const [items, setItems] = useState<PVCData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loader().then(setItems).finally(() => setLoading(false));
  }, [loader]);

  if (loading) {
    return <div className="text-xs text-gray-500">Loading PVCs...</div>;
  }

  if (items.length === 0) {
    return <div className="text-xs text-gray-500">No PVCs found</div>;
  }

  return (
    <div className="space-y-1">
      {items.map(pvc => (
        <div key={pvc.name} className={`flex items-center justify-between text-xs px-2 py-1.5 rounded ${
          pvc.status === 'Bound' 
            ? 'bg-emerald-500/10 border border-emerald-500/20'
            : 'bg-gray-900/50 border border-gray-700'
        }`}>
          <div className="flex items-center gap-2">
            <HardDrive size={12} className={pvc.status === 'Bound' ? 'text-emerald-400' : 'text-gray-500'} />
            <span className="text-gray-300">{pvc.name}</span>
          </div>
          <div className="flex items-center gap-3">
            {pvc.capacity && (
              <span className="text-cyan-400">{pvc.capacity}</span>
            )}
            <span className={pvc.status === 'Bound' ? 'text-emerald-400' : 'text-amber-400'}>
              {pvc.status}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function RelatedJobsSection({ loader }: { loader: () => Promise<JobData[]> }) {
  const [items, setItems] = useState<JobData[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    loader().then(setItems).finally(() => setLoading(false));
  }, [loader]);

  if (loading) {
    return <div className="text-xs text-gray-500">Loading jobs...</div>;
  }

  if (items.length === 0) {
    return <div className="text-xs text-gray-500">No jobs found</div>;
  }

  const displayJobs = expanded ? items : items.slice(0, 3);

  return (
    <div className="space-y-1">
      {displayJobs.map(job => (
        <div 
          key={job.name} 
          className={`flex items-center justify-between text-xs px-2 py-1.5 rounded ${
            job.status === 'Complete' 
              ? 'bg-emerald-500/10 border border-emerald-500/20' 
              : job.status === 'Failed'
              ? 'bg-red-500/10 border border-red-500/20'
              : 'bg-amber-500/10 border border-amber-500/20'
          }`}
        >
          <div className="flex items-center gap-2">
            {job.status === 'Complete' ? (
              <CheckCircle2 size={12} className="text-emerald-400" />
            ) : job.status === 'Failed' ? (
              <XCircle size={12} className="text-red-400" />
            ) : (
              <Clock size={12} className="text-amber-400" />
            )}
            <span className="text-gray-300 truncate max-w-45" title={job.name}>{job.name}</span>
          </div>
          <div className="flex items-center gap-2">
            {job.startTime && (
              <span className="text-gray-500">{formatTimeAgo(new Date(job.startTime))}</span>
            )}
            <span className={
              job.status === 'Complete' ? 'text-emerald-400' :
              job.status === 'Failed' ? 'text-red-400' : 'text-amber-400'
            }>
              {job.status}
            </span>
          </div>
        </div>
      ))}
      {items.length > 3 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors mt-2"
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {expanded ? 'Show less' : `Show ${items.length - 3} more`}
        </button>
      )}
    </div>
  );
}

function VolumeClaimTemplatesSection({ items }: { items: VolumeClaimTemplateData[] }) {
  return (
    <div className="space-y-2">
      {items.map((template, i) => (
        <div key={i} className="bg-gray-900/50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <HardDrive size={14} className="text-purple-400" />
            <span className="text-sm text-gray-100">{template.name}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {template.size && (
              <div>
                <span className="text-gray-500">Size:</span>{' '}
                <span className="text-cyan-400">{template.size}</span>
              </div>
            )}
            {template.storageClass && (
              <div>
                <span className="text-gray-500">Class:</span>{' '}
                <span className="text-purple-400">{template.storageClass}</span>
              </div>
            )}
            {template.accessModes && (
              <div className="col-span-2">
                <span className="text-gray-500">Access:</span>{' '}
                <span className="text-gray-300">{template.accessModes.join(', ')}</span>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function ScheduleSection({ schedule, description }: { schedule: string; description: string }) {
  return (
    <div className="bg-gray-900/50 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-2">
        <Calendar size={16} className="text-purple-400" />
        <span className="text-sm text-gray-100">Schedule</span>
      </div>
      <div className="font-mono text-cyan-400 text-lg mb-1">{schedule}</div>
      <div className="text-xs text-gray-500">{description}</div>
    </div>
  );
}

function JobProgressSection({ completions, succeeded, failed, active }: { completions: number; succeeded: number; failed: number; active: number }) {
  return (
    <div className="bg-gray-900/50 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-300">Completions</span>
        <span className="text-sm">
          <span className={succeeded >= completions ? 'text-emerald-400' : 'text-cyan-400'}>{succeeded}</span>
          <span className="text-gray-500"> / {completions}</span>
        </span>
      </div>
      <div className="h-2 bg-gray-700 rounded-full overflow-hidden flex">
        {succeeded > 0 && (
          <div 
            className="h-full bg-emerald-500"
            style={{ width: `${(succeeded / completions) * 100}%` }}
          />
        )}
        {failed > 0 && (
          <div 
            className="h-full bg-red-500"
            style={{ width: `${(failed / (completions + failed)) * 100}%` }}
          />
        )}
      </div>
      
      {/* Pod Status Indicators */}
      <div className="flex items-center gap-4 mt-3 text-xs">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-gray-400">Succeeded: {succeeded}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-amber-500" />
          <span className="text-gray-400">Active: {active}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-red-500" />
          <span className="text-gray-400">Failed: {failed}</span>
        </div>
      </div>
    </div>
  );
}

function TimelineSection({ startTime, completionTime }: { startTime?: Date; completionTime?: Date }) {
  return (
    <div className="bg-gray-900/50 rounded-lg p-3 space-y-2 text-xs">
      {startTime && (
        <div>
          <span className="text-gray-500">Started:</span>{' '}
          <span className="text-purple-400">{startTime.toLocaleString()}</span>
        </div>
      )}
      {completionTime && (
        <div>
          <span className="text-gray-500">Completed:</span>{' '}
          <span className="text-emerald-400">{completionTime.toLocaleString()}</span>
        </div>
      )}
    </div>
  );
}

function AddressesSection({ addresses }: { addresses: Array<{ type: string; address: string }> }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {addresses.map((addr, i) => (
        <div key={i} className="bg-gray-900/50 rounded-lg p-2">
          <div className="text-xs text-gray-500">{addr.type}</div>
          <div className="text-sm text-cyan-400 font-mono">{addr.address}</div>
        </div>
      ))}
    </div>
  );
}
