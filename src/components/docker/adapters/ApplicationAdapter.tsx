// Docker Compose Application Adapter
// Extracts display data from Docker Compose applications (projects)

import type { DockerAdapter, InfoRowData, Section, ContainerData, EnvVarData } from './types';
import type { ComposeApplication, ContainerInspect } from '../../../api/docker/docker';

// Map Docker container state to ContainerData state
function mapDockerState(running?: boolean, paused?: boolean, status?: string): ContainerData['state'] {
  if (running) return 'running';
  if (paused) return 'paused';
  switch (status?.toLowerCase()) {
    case 'exited': return 'exited';
    case 'created': return 'created';
    case 'dead': return 'dead';
    case 'removing': return 'removing';
    case 'restarting': return 'restarting';
    default: return undefined;
  }
}

// Convert inspected Docker container to ContainerData format (with full env vars)
function inspectedContainerToContainerData(container: ContainerInspect): ContainerData {
  const config = container.Config;
  const state = container.State;

  // Parse environment variables
  const env: EnvVarData[] = (config?.Env ?? []).map(envStr => {
    const [key, ...valueParts] = envStr.split('=');
    return {
      name: key,
      value: valueParts.join('='),
    };
  });

  // Extract ports
  const ports = Object.entries(config?.ExposedPorts ?? {}).map(([port]) => {
    const [portNum, protocol] = port.split('/');
    return {
      containerPort: parseInt(portNum, 10),
      protocol: protocol?.toUpperCase(),
    };
  });

  // Extract mounts
  const mounts = container.Mounts?.map(m => ({
    name: m.Name ?? m.Type ?? 'mount',
    mountPath: m.Destination ?? '',
    readOnly: !m.RW,
  }));

  // Get container name (remove leading /)
  const name = container.Name?.replace(/^\//, '') ?? container.Id?.substring(0, 12) ?? 'unknown';

  return {
    name,
    image: config?.Image ?? '',
    state: mapDockerState(state?.Running, state?.Paused, state?.Status),
    stateReason: state?.Error || state?.Status,
    command: config?.Cmd ?? undefined,
    ports: ports.length > 0 ? ports : undefined,
    mounts: mounts && mounts.length > 0 ? mounts : undefined,
    env: env.length > 0 ? env : undefined,
  };
}

export const ApplicationAdapter: DockerAdapter<ComposeApplication> = {
  types: ['application'],

  adapt(_context, application): { sections: Section[] } {
    const sections: Section[] = [];

    // Containers section - all service containers grouped together (like pods)
    const allContainers: ContainerData[] = [];
    for (const service of application.services) {
      // Convert inspected containers to ContainerData format with group and replica info
      const serviceContainers = service.containers.map(c => ({
        ...inspectedContainerToContainerData(c),
        group: service.name,
        replicas: `${service.running}/${service.total}`,
      }));
      allContainers.push(...serviceContainers);
    }

    if (allContainers.length > 0) {
      sections.push({
        id: 'containers',
        title: 'Containers',
        data: { type: 'containers', items: allContainers },
      });
    }

    // Networks section
    if (application.networks.length > 0) {
      const networkItems: InfoRowData[] = application.networks.map(network => ({
        label: network.Name ?? 'unknown',
        value: `${network.Driver ?? 'bridge'} (${network.Scope ?? 'local'})`,
      }));

      sections.push({
        id: 'networks',
        title: 'Networks',
        data: { type: 'info-grid', items: networkItems },
      });
    }

    // Volumes section
    if (application.volumes.length > 0) {
      const volumeItems: InfoRowData[] = application.volumes.map(volume => ({
        label: volume.Name ?? 'unknown',
        value: volume.Driver ?? 'local',
      }));

      sections.push({
        id: 'volumes',
        title: 'Volumes',
        data: { type: 'info-grid', items: volumeItems },
      });
    }

    return { sections };
  },

  // No actions for applications (read-only view)
  actions: [],
};
