// Docker Container Adapter
// Extracts display data from Docker containers

import type { DockerAdapter, StatusCardData, InfoRowData, ContainerData, VolumeData, Section, EnvVarData } from './types';
import type { ContainerInspectResponse } from '../../../api/docker/docker';
import {
  startContainer,
  stopContainer,
  restartContainer,
  pauseContainer,
  unpauseContainer,
  removeContainer,
} from '../../../api/docker/docker';
import { Play, Pause, Square, RefreshCw, Link as LinkIcon, LayoutGrid } from 'lucide-react';
import { createElement } from 'react';
import { Link } from '@tanstack/react-router';
import { createDeleteAction } from '../../sections/actionHelpers';

// Docker Compose label constants
const COMPOSE_PROJECT_LABEL = 'com.docker.compose.project';
const COMPOSE_SERVICE_LABEL = 'com.docker.compose.service';

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

  adapt(context, container): { sections: Section[] } {
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

    // Application link (if part of a Docker Compose project)
    const composeProject = config?.Labels?.[COMPOSE_PROJECT_LABEL];
    const composeService = config?.Labels?.[COMPOSE_SERVICE_LABEL];
    if (composeProject && context) {
      sections.push({
        id: 'application',
        data: {
          type: 'custom' as const,
          render: () => (
            <Link
              to="/docker/$context/$resourceType/$name"
              params={{ context, resourceType: 'applications', name: composeProject }}
            >
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 hover:bg-blue-500/15 transition-colors cursor-pointer">
                <div className="text-xs text-neutral-500 mb-1 flex items-center gap-1">
                  <LinkIcon size={10} /> Part of Application
                </div>
                <div className="text-sm flex items-center gap-2">
                  <LayoutGrid size={14} className="text-blue-400" />
                  <span className="text-cyan-400">{composeProject}</span>
                  {composeService && (
                    <span className="text-neutral-500">/ {composeService}</span>
                  )}
                </div>
              </div>
            </Link>
          ),
        },
      });
    }

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
    // Parse environment variables
    const envItems: EnvVarData[] = (config?.Env ?? []).map(env => {
      const [key, ...valueParts] = env.split('=');
      return {
        name: key,
        value: valueParts.join('='),
      };
    });

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
      env: envItems.length > 0 ? envItems : undefined,
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
      execute: async (context, resource) => {
        const container = resource as ContainerInspectResponse;
        await startContainer(context, container.Id!);
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
      execute: async (context, resource) => {
        const container = resource as ContainerInspectResponse;
        await stopContainer(context, container.Id!);
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
      execute: async (context, resource) => {
        const container = resource as ContainerInspectResponse;
        await restartContainer(context, container.Id!);
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
      execute: async (context, resource) => {
        const container = resource as ContainerInspectResponse;
        await pauseContainer(context, container.Id!);
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
      execute: async (context, resource) => {
        const container = resource as ContainerInspectResponse;
        await unpauseContainer(context, container.Id!);
      },
      isVisible: (resource) => {
        const container = resource as ContainerInspectResponse;
        return container.State?.Paused === true;
      },
    },
    createDeleteAction<ContainerInspectResponse>(
      async (context, resource) => {
        await removeContainer(context, resource.Id!);
      },
      {
        message: 'Are you sure you want to delete this container? This action cannot be undone.',
        isVisible: (resource) => !resource.State?.Running,
      }
    ),
  ],
};
