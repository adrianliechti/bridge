// Docker Volume Adapter
// Extracts display data from Docker volumes

import type { DockerAdapter, StatusCardData, InfoRowData, Section } from './types';
import type { DockerVolume } from '../../../api/docker/docker';
import { removeVolume } from '../../../api/docker/docker';
import { Trash2, HardDrive } from 'lucide-react';
import { createElement } from 'react';

// Format bytes to human readable size
function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes === null || bytes < 0) return 'Unknown';
  if (bytes === 0) return '0 B';
  
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

export const VolumeAdapter: DockerAdapter<DockerVolume> = {
  types: ['volume'],

  adapt(volume): { sections: Section[] } {
    const sections: Section[] = [];

    // Status section
    const statusCards: StatusCardData[] = [
      {
        label: 'Driver',
        value: volume.Driver ?? 'local',
        status: 'neutral',
        icon: createElement(HardDrive, { size: 14 }),
      },
    ];

    if (volume.UsageData?.Size !== undefined && volume.UsageData.Size >= 0) {
      statusCards.push({
        label: 'Size',
        value: formatBytes(volume.UsageData.Size),
        status: 'neutral',
      });
    }

    if (volume.UsageData?.RefCount !== undefined && volume.UsageData.RefCount >= 0) {
      statusCards.push({
        label: 'Containers',
        value: volume.UsageData.RefCount,
        status: volume.UsageData.RefCount > 0 ? 'success' : 'neutral',
      });
    }

    sections.push({
      id: 'status',
      data: { type: 'status-cards', items: statusCards },
    });

    // Info section
    const infoItems: InfoRowData[] = [
      { label: 'Name', value: volume.Name },
      { label: 'Driver', value: volume.Driver },
      { label: 'Scope', value: volume.Scope },
      { label: 'Mountpoint', value: volume.Mountpoint },
    ];

    if (volume.CreatedAt) {
      infoItems.push({ label: 'Created', value: new Date(volume.CreatedAt).toLocaleString() });
    }

    sections.push({
      id: 'info',
      title: 'Information',
      data: { type: 'info-grid', items: infoItems.filter(item => item.value) },
    });

    // Labels section
    const labels = volume.Labels;
    if (labels && Object.keys(labels).length > 0) {
      sections.push({
        id: 'labels',
        data: { type: 'labels', labels },
      });
    }

    // Options section
    const options = volume.Options;
    if (options && Object.keys(options).length > 0) {
      const optionItems: InfoRowData[] = Object.entries(options).map(([key, value]) => ({
        label: key,
        value: value,
      }));

      sections.push({
        id: 'options',
        title: 'Driver Options',
        data: { type: 'info-grid', items: optionItems },
      });
    }

    return { sections };
  },

  actions: [
    {
      id: 'delete',
      label: 'Delete',
      icon: createElement(Trash2, { size: 14 }),
      variant: 'danger',
      confirm: {
        title: 'Delete Volume',
        message: 'Are you sure you want to delete this volume? This action cannot be undone and all data will be lost.',
        confirmLabel: 'Delete',
      },
      execute: async (_context, resource) => {
        const volume = resource as DockerVolume;
        await removeVolume(volume.Name!);
      },
      isDisabled: (resource) => {
        const volume = resource as DockerVolume;
        if (volume.UsageData?.RefCount && volume.UsageData.RefCount > 0) {
          return 'Volume is in use by containers';
        }
        return false;
      },
    },
  ],
};
