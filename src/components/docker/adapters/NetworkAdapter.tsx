// Docker Network Adapter
// Extracts display data from Docker networks

import type { DockerAdapter, StatusCardData, InfoRowData, Section } from './types';
import type { DockerNetworkInspect } from '../../../api/docker/docker';
import { removeNetwork } from '../../../api/docker/docker';
import { Trash2, Network, Globe, Lock } from 'lucide-react';
import { createElement } from 'react';

// Built-in Docker networks that should not be deleted
const BUILTIN_NETWORKS = ['bridge', 'host', 'none'];

export const NetworkAdapter: DockerAdapter<DockerNetworkInspect> = {
  types: ['network'],

  adapt(network): { sections: Section[] } {
    const sections: Section[] = [];
    const ipam = network.IPAM;
    const containers = network.Containers;

    // Status section
    const statusCards: StatusCardData[] = [
      {
        label: 'Driver',
        value: network.Driver ?? 'bridge',
        status: 'neutral',
        icon: createElement(Network, { size: 14 }),
      },
      {
        label: 'Scope',
        value: network.Scope ?? 'local',
        status: 'neutral',
        icon: createElement(Globe, { size: 14 }),
      },
    ];

    if (network.Internal) {
      statusCards.push({
        label: 'Internal',
        value: 'Yes',
        status: 'warning',
        icon: createElement(Lock, { size: 14 }),
      });
    }

    const containerCount = containers ? Object.keys(containers).length : 0;
    statusCards.push({
      label: 'Containers',
      value: containerCount,
      status: containerCount > 0 ? 'success' : 'neutral',
    });

    sections.push({
      id: 'status',
      data: { type: 'status-cards', items: statusCards },
    });

    // Info section
    const infoItems: InfoRowData[] = [
      { label: 'Name', value: network.Name },
      { label: 'ID', value: network.Id?.substring(0, 12) },
      { label: 'Driver', value: network.Driver },
      { label: 'Scope', value: network.Scope },
    ];

    if (network.Created) {
      infoItems.push({ label: 'Created', value: new Date(network.Created).toLocaleString() });
    }

    // Add boolean flags
    if (network.EnableIPv6) {
      infoItems.push({ label: 'IPv6', value: 'Enabled' });
    }
    if (network.Internal) {
      infoItems.push({ label: 'Internal', value: 'Yes' });
    }
    if (network.Attachable) {
      infoItems.push({ label: 'Attachable', value: 'Yes' });
    }
    if (network.Ingress) {
      infoItems.push({ label: 'Ingress', value: 'Yes' });
    }

    sections.push({
      id: 'info',
      title: 'Information',
      data: { type: 'info-grid', items: infoItems.filter(item => item.value) },
    });

    // IPAM Configuration section
    if (ipam?.Config && ipam.Config.length > 0) {
      const ipamItems: InfoRowData[] = [];
      
      ipamItems.push({ label: 'Driver', value: ipam.Driver ?? 'default' });
      
      ipam.Config.forEach((config, index) => {
        const prefix = ipam.Config!.length > 1 ? `[${index + 1}] ` : '';
        if (config.Subnet) {
          ipamItems.push({ label: `${prefix}Subnet`, value: config.Subnet });
        }
        if (config.Gateway) {
          ipamItems.push({ label: `${prefix}Gateway`, value: config.Gateway });
        }
        if (config.IPRange) {
          ipamItems.push({ label: `${prefix}IP Range`, value: config.IPRange });
        }
      });

      sections.push({
        id: 'ipam',
        title: 'IPAM Configuration',
        data: { type: 'info-grid', items: ipamItems },
      });
    }

    // Connected Containers section
    if (containers && Object.keys(containers).length > 0) {
      const containerItems: InfoRowData[] = Object.entries(containers).map(([id, container]) => ({
        label: container.Name || id.substring(0, 12),
        value: container.IPv4Address || container.IPv6Address || 'No IP',
      }));

      sections.push({
        id: 'containers',
        title: 'Connected Containers',
        data: { type: 'info-grid', items: containerItems },
      });
    }

    // Labels section
    const labels = network.Labels;
    if (labels && Object.keys(labels).length > 0) {
      sections.push({
        id: 'labels',
        data: { type: 'labels', labels },
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
        title: 'Delete Network',
        message: 'Are you sure you want to delete this network? This action cannot be undone.',
        confirmLabel: 'Delete',
      },
      execute: async (_context, resource) => {
        const network = resource as DockerNetworkInspect;
        await removeNetwork(network.Id!);
      },
      isDisabled: (resource) => {
        const network = resource as DockerNetworkInspect;
        // Can't delete built-in networks
        if (network.Name && BUILTIN_NETWORKS.includes(network.Name)) {
          return 'Cannot delete built-in network';
        }
        // Can't delete networks with connected containers
        if (network.Containers && Object.keys(network.Containers).length > 0) {
          return 'Network has connected containers';
        }
        return false;
      },
      isVisible: (resource) => {
        const network = resource as DockerNetworkInspect;
        // Hide delete for built-in networks
        return !network.Name || !BUILTIN_NETWORKS.includes(network.Name);
      },
    },
  ],
};
