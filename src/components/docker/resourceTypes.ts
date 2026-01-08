/**
 * Shared resource type configuration for Docker resources
 * Used by both Nav.tsx and Commands.ts (command palette)
 */

import {
  Box,
  Layers,
  HardDrive,
  Network,
  LayoutGrid,
  type LucideIcon,
} from 'lucide-react';

export type DockerResourceType = 'applications' | 'containers' | 'images' | 'volumes' | 'networks';

/**
 * Docker resource type definition with icon and aliases
 */
export interface DockerResourceTypeConfig {
  /** Resource type ID */
  kind: DockerResourceType;
  /** Display label */
  label: string;
  /** Lucide icon component */
  icon: LucideIcon;
  /** Command palette aliases */
  aliases?: string[];
}

/**
 * All Docker resource types with icons and command palette aliases
 */
export const dockerResourceTypes: DockerResourceTypeConfig[] = [
  { kind: 'applications', label: 'Applications', icon: LayoutGrid, aliases: ['app', 'apps'] },
  { kind: 'containers', label: 'Containers', icon: Box, aliases: ['c', 'container'] },
  { kind: 'images', label: 'Images', icon: Layers, aliases: ['i', 'img', 'image'] },
  { kind: 'volumes', label: 'Volumes', icon: HardDrive, aliases: ['v', 'vol', 'volume'] },
  { kind: 'networks', label: 'Networks', icon: Network, aliases: ['n', 'net', 'network'] },
];

/**
 * Map for quick lookup by kind
 */
const resourceTypeMap = new Map<string, DockerResourceTypeConfig>();
for (const rt of dockerResourceTypes) {
  resourceTypeMap.set(rt.kind, rt);
}

/**
 * Get resource type config by kind
 */
export function getDockerResourceTypeConfig(kind: string): DockerResourceTypeConfig | undefined {
  return resourceTypeMap.get(kind);
}

/**
 * Get icon for a Docker resource kind
 */
export function getDockerResourceIcon(kind: string): LucideIcon {
  return resourceTypeMap.get(kind)?.icon ?? Box;
}
