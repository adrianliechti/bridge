// Docker Container Adapter
// Extracts display data from Docker containers

import type { DockerAdapter, StatusCardData, InfoRowData, ContainerData, VolumeData, Section } from './types';
import type { ContainerInspectResponse } from '../../../api/docker/docker';
import {
  startContainer,
  stopContainer,
  restartContainer,
  pauseContainer,
  unpauseContainer,
  removeContainer,
} from '../../../api/docker/docker';
import { Play, Pause, Square, RefreshCw, Trash2 } from 'lucide-react';
import { createElement } from 'react';

// Map Docker states to our unified state type
function mapDockerState(state?: string): ContainerData['state'] {
  switch (state?.toLowerCase()) {
    case 'running': return 'running';
    case 'paused': return 'paused';
    case 'exited': return 'exited';
    case 'created': return 'created';
    case 'dead': return 'dead';
    case 'removing': return 'removing';
    case 'restarting': return 'restarting';
    default: return undefined;
  }
}

// Get status level from Docker state
function getStatusLevel(state?: string): 'success' | 'warning' | 'error' | 'neutral' {
  switch (state?.toLowerCase()) {
    case 'running': return 'success';
    case 'paused': return 'warning';
    case 'restarting': return 'warning';
    case 'exited':
    case 'dead': return 'error';
    default: return 'neutral';
  }
}

export const ContainerAdapter: DockerAdapter<ContainerInspectResponse> = {
  types: ['container'],

  adapt(container): { sections: Section[] } {
    const sections: Section[] = [];
    const state = container.State;
    const config = container.Config;
    const networkSettings = container.NetworkSettings;

    // Status section
    const statusCards: StatusCardData[] = [
      {
        label: 'Status',
        value: state?.Status ?? 'Unknown',
        status: getStatusLevel(state?.Status),
        icon: state?.Running 
          ? createElement(Play, { size: 14 }) 
          : state?.Paused 
            ? createElement(Pause, { size: 14 })
            : createElement(Square, { size: 14 }),
      },
    ];

    if (state?.Running) {
      statusCards.push({
        label: 'PID',
        value: state.Pid ?? 0,
        status: 'neutral',
      });
    }

    if (state?.ExitCode !== undefined && state.ExitCode !== 0) {
      statusCards.push({
        label: 'Exit Code',
        value: state.ExitCode,
        status: 'error',
      });
    }

    sections.push({
      id: 'status',
      data: { type: 'status-cards', items: statusCards },
    });

    // Info section
    const infoItems: InfoRowData[] = [
      { label: 'ID', value: container.Id?.substring(0, 12) },
      { label: 'Name', value: container.Name?.replace(/^\//, '') },
      { label: 'Image', value: config?.Image },
      { label: 'Created', value: container.Created ? new Date(container.Created).toLocaleString() : undefined },
      { label: 'Platform', value: container.Platform },
      { label: 'Driver', value: container.Driver },
    ];

    if (state?.StartedAt && state.StartedAt !== '0001-01-01T00:00:00Z') {
      infoItems.push({ label: 'Started', value: new Date(state.StartedAt).toLocaleString() });
    }

    if (state?.FinishedAt && state.FinishedAt !== '0001-01-01T00:00:00Z') {
      infoItems.push({ label: 'Finished', value: new Date(state.FinishedAt).toLocaleString() });
    }

    sections.push({
      id: 'info',
      title: 'Container',
      data: { type: 'info-grid', items: infoItems, columns: 2 },
    });

    // Container details section (as a single "container")
    const containerData: ContainerData[] = [{
      name: container.Name?.replace(/^\//, '') ?? 'container',
      image: config?.Image ?? '',
      state: mapDockerState(state?.Status),
      stateReason: state?.Error || undefined,
      command: config?.Cmd ?? undefined,
      args: undefined,
      ports: Object.entries(config?.ExposedPorts ?? {}).map(([port]) => {
        const [portNum, protocol] = port.split('/');
        return {
          containerPort: parseInt(portNum, 10),
          protocol: protocol?.toUpperCase(),
        };
      }),
      mounts: container.Mounts?.map(m => ({
        name: m.Name ?? m.Type ?? 'mount',
        mountPath: m.Destination ?? '',
        readOnly: !m.RW,
      })),
    }];

    sections.push({
      id: 'containers',
      title: 'Configuration',
      data: { type: 'containers', items: containerData },
    });

    // Network section - use addresses section for IP addresses
    if (networkSettings?.Networks && Object.keys(networkSettings.Networks).length > 0) {
      const addresses: Array<{ type: string; address: string }> = [];
      const networkInfo: InfoRowData[] = [];
      
      for (const [name, network] of Object.entries(networkSettings.Networks)) {
        // Add IP addresses to addresses section
        if (network.IPAddress) {
          addresses.push({ type: `${name} IP`, address: network.IPAddress });
        }
        if (network.Gateway) {
          addresses.push({ type: `${name} Gateway`, address: network.Gateway });
        }
        // Keep MAC in info-grid as it's not really an "address" in the network sense
        if (network.MacAddress) {
          networkInfo.push({ label: `${name} MAC`, value: network.MacAddress });
        }
      }

      // Add addresses section if there are any
      if (addresses.length > 0) {
        sections.push({
          id: 'network-addresses',
          title: 'Network',
          data: { type: 'addresses', addresses },
        });
      }

      // Add additional network info (MAC addresses) if any
      if (networkInfo.length > 0) {
        sections.push({
          id: 'network-info',
          data: { type: 'info-grid', items: networkInfo, columns: 2 },
        });
      }
    }

    // Ports section
    if (networkSettings?.Ports && Object.keys(networkSettings.Ports).length > 0) {
      const portInfo: InfoRowData[] = [];
      
      for (const [containerPort, hostBindings] of Object.entries(networkSettings.Ports)) {
        if (hostBindings && hostBindings.length > 0) {
          for (const binding of hostBindings) {
            portInfo.push({
              label: containerPort,
              value: `${binding.HostIp || '0.0.0.0'}:${binding.HostPort}`,
            });
          }
        } else {
          portInfo.push({ label: containerPort, value: 'not published' });
        }
      }

      sections.push({
        id: 'ports',
        title: 'Ports',
        data: { type: 'info-grid', items: portInfo, columns: 2 },
      });
    }

    // Mounts/Volumes section
    if (container.Mounts && container.Mounts.length > 0) {
      const volumes: VolumeData[] = container.Mounts.map(m => ({
        name: m.Name ?? m.Source ?? 'volume',
        type: m.Type ?? 'unknown',
        source: m.Source ?? '',
        extra: m.Driver ? { Driver: m.Driver } : undefined,
        mounts: [{
          container: container.Name?.replace(/^\//, '') ?? 'container',
          mountPath: m.Destination ?? '',
          readOnly: !m.RW,
        }],
      }));

      sections.push({
        id: 'volumes',
        title: 'Mounts',
        data: { type: 'volumes', items: volumes },
      });
    }

    // Environment variables as labels
    if (config?.Env && config.Env.length > 0) {
      const envLabels: Record<string, string> = {};
      for (const env of config.Env) {
        const [key, ...valueParts] = env.split('=');
        envLabels[key] = valueParts.join('=');
      }

      sections.push({
        id: 'env',
        data: { type: 'labels', labels: envLabels, title: 'Environment Variables' },
      });
    }

    // Labels
    if (config?.Labels && Object.keys(config.Labels).length > 0) {
      sections.push({
        id: 'labels',
        data: { type: 'labels', labels: config.Labels },
      });
    }

    return { sections };
  },

  actions: [
    {
      id: 'start',
      label: 'Start',
      icon: createElement(Play, { size: 14 }),
      variant: 'primary',
      execute: async (_context, resource) => {
        const container = resource as ContainerInspectResponse;
        await startContainer(container.Id!);
      },
      isVisible: (resource) => {
        const container = resource as ContainerInspectResponse;
        return !container.State?.Running;
      },
    },
    {
      id: 'stop',
      label: 'Stop',
      icon: createElement(Square, { size: 14 }),
      variant: 'warning',
      execute: async (_context, resource) => {
        const container = resource as ContainerInspectResponse;
        await stopContainer(container.Id!);
      },
      isVisible: (resource) => {
        const container = resource as ContainerInspectResponse;
        return container.State?.Running === true;
      },
    },
    {
      id: 'restart',
      label: 'Restart',
      icon: createElement(RefreshCw, { size: 14 }),
      variant: 'secondary',
      execute: async (_context, resource) => {
        const container = resource as ContainerInspectResponse;
        await restartContainer(container.Id!);
      },
      isVisible: (resource) => {
        const container = resource as ContainerInspectResponse;
        return container.State?.Running === true;
      },
    },
    {
      id: 'pause',
      label: 'Pause',
      icon: createElement(Pause, { size: 14 }),
      variant: 'secondary',
      execute: async (_context, resource) => {
        const container = resource as ContainerInspectResponse;
        await pauseContainer(container.Id!);
      },
      isVisible: (resource) => {
        const container = resource as ContainerInspectResponse;
        return container.State?.Running === true && !container.State?.Paused;
      },
    },
    {
      id: 'unpause',
      label: 'Unpause',
      icon: createElement(Play, { size: 14 }),
      variant: 'secondary',
      execute: async (_context, resource) => {
        const container = resource as ContainerInspectResponse;
        await unpauseContainer(container.Id!);
      },
      isVisible: (resource) => {
        const container = resource as ContainerInspectResponse;
        return container.State?.Paused === true;
      },
    },
    {
      id: 'delete',
      label: 'Delete',
      icon: createElement(Trash2, { size: 14 }),
      variant: 'danger',
      confirm: {
        title: 'Delete Container',
        message: 'Are you sure you want to delete this container? This action cannot be undone.',
        confirmLabel: 'Delete',
      },
      execute: async (_context, resource) => {
        const container = resource as ContainerInspectResponse;
        await removeContainer(container.Id!);
      },
      isVisible: (resource) => {
        const container = resource as ContainerInspectResponse;
        return !container.State?.Running;
      },
    },
  ],
};
