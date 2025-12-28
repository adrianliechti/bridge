// PersistentVolumeClaim Adapter
// Extracts display data from PersistentVolumeClaim resources

import { HardDrive, Database, ExternalLink, Link } from 'lucide-react';
import type { ResourceAdapter, ResourceSections, Section } from './types';
import { getAccessModeStyle, formatAccessMode } from './utils';
import type { V1PersistentVolumeClaim } from '@kubernetes/client-node';

export const PersistentVolumeClaimAdapter: ResourceAdapter<V1PersistentVolumeClaim> = {
  kinds: ['PersistentVolumeClaim', 'PersistentVolumeClaims'],

  adapt(_context: string, resource): ResourceSections {
    const spec = resource.spec;
    const status = resource.status;

    if (!spec) {
      return { sections: [] };
    }

    const phase = status?.phase ?? 'Unknown';
    const volumeName = spec.volumeName;
    const requestedStorage = spec.resources?.requests?.storage;
    const actualCapacity = status?.capacity?.storage;

    const sections: Section[] = [
      // Status overview
      {
        id: 'status',
        data: {
          type: 'status-cards',
          items: [
            { label: 'Phase', value: phase, status: getPhaseStatus(phase) },
            { 
              label: 'Requested', 
              value: requestedStorage ?? 'Not specified',
              icon: <HardDrive size={14} className="text-purple-400" />
            },
            ...(actualCapacity ? [{ 
              label: 'Actual Capacity', 
              value: actualCapacity,
              status: 'success' as const
            }] : []),
            { label: 'Volume Mode', value: spec.volumeMode ?? 'Filesystem' },
          ],
        },
      },
    ];

    // Access Modes
    if (spec.accessModes?.length) {
      sections.push({
        id: 'access-modes',
        title: 'Access Modes',
        data: {
          type: 'custom',
          render: () => (
            <div className="flex flex-wrap gap-2">
              {spec.accessModes!.map((mode, i) => (
                <span 
                  key={i} 
                  className={`text-xs px-2 py-1 rounded ${getAccessModeStyle(mode)}`}
                >
                  {formatAccessMode(mode)}
                </span>
              ))}
            </div>
          ),
        },
      });
    }

    // Storage Class
    if (spec.storageClassName) {
      sections.push({
        id: 'storage-class',
        data: {
          type: 'custom',
          render: () => (
            <div className="bg-neutral-100 dark:bg-neutral-900/50 rounded-lg p-3">
              <div className="text-xs text-neutral-600 dark:text-neutral-500 mb-1">Storage Class</div>
              <div className="text-sm text-purple-600 dark:text-purple-400 flex items-center gap-2">
                <Database size={14} />
                {spec.storageClassName}
              </div>
            </div>
          ),
        },
      });
    }

    // Bound Volume
    if (volumeName) {
      sections.push({
        id: 'bound-volume',
        data: {
          type: 'custom',
          render: () => (
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
              <div className="text-xs text-neutral-600 dark:text-neutral-500 mb-1 flex items-center gap-1">
                <Link size={10} /> Bound To
              </div>
              <div className="text-sm">
                <span className="text-neutral-700 dark:text-neutral-400">platform/</span>
                <span className="text-cyan-600 dark:text-cyan-400">{volumeName}</span>
              </div>
            </div>
          ),
        },
      });
    } else {
      sections.push({
        id: 'no-volume',
        data: {
          type: 'custom',
          render: () => (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
              <div className="text-yellow-400 text-sm flex items-center gap-2">
                <ExternalLink size={14} />
                Not bound to any volume
              </div>
            </div>
          ),
        },
      });
    }

    // Selector (if any)
    if (spec.selector?.matchLabels && Object.keys(spec.selector.matchLabels).length > 0) {
      sections.push({
        id: 'selector',
        title: 'Volume Selector',
        data: {
          type: 'labels',
          labels: spec.selector.matchLabels,
        },
      });
    }

    // Conditions
    if (status?.conditions?.length) {
      sections.push({
        id: 'conditions',
        title: 'Conditions',
        data: {
          type: 'conditions',
          items: status.conditions.map(c => ({
            type: c.type ?? '',
            status: c.status ?? 'Unknown',
            reason: c.reason,
            message: c.message,
          })),
        },
      });
    }

    return { sections };
  },
};

function getPhaseStatus(phase: string): 'success' | 'warning' | 'error' | 'neutral' {
  switch (phase) {
    case 'Bound': return 'success';
    case 'Pending': return 'warning';
    case 'Lost': return 'error';
    default: return 'neutral';
  }
}
