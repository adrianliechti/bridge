import { Box, Layers } from 'lucide-react';
import { listContainers, listImages } from '../../api/docker/docker';
import type {
  CommandPaletteAdapter,
  ResourceTypeItem,
  NamespaceItem,
  SearchResult,
  SearchMode,
} from '../../types/commandPalette';
import { dockerResourceTypes, type DockerResourceType } from './resourceTypes';

export type { DockerResourceType };

// Normalize string for fuzzy matching (remove hyphens, underscores, dots)
function normalizeForSearch(str: string): string {
  return str.toLowerCase().replace(/[-_.]/g, '');
}

// Convert shared resource types to command palette format
const commandPaletteResourceTypes: ResourceTypeItem[] = dockerResourceTypes.map(rt => ({
  kind: rt.kind,
  label: rt.label,
  icon: rt.icon,
  category: 'Docker',
  aliases: rt.aliases,
}));

interface DockerAdapterOptions {
  context: string;
  onSelectResource: (type: DockerResourceType) => void;
  onSelectItem: (type: DockerResourceType, itemId: string) => void;
  onClose: () => void;
}

/**
 * Find a resource type by name, kind, or alias (case-insensitive)
 */
function findResourceTypeByQuery(query: string): ResourceTypeItem | undefined {
  const q = query.toLowerCase();
  return commandPaletteResourceTypes.find(rt => 
    rt.kind.toLowerCase() === q ||
    rt.label.toLowerCase() === q ||
    rt.aliases?.some(a => a.toLowerCase() === q)
  );
}

export function createDockerAdapter(options: DockerAdapterOptions): CommandPaletteAdapter {
  const { context, onSelectResource, onSelectItem, onClose } = options;

  const adapter: CommandPaletteAdapter = {
    id: 'docker',
    resourceTypes: commandPaletteResourceTypes,
    supportsNamespaces: false,
    
    searchModePrefixes: [
      { prefix: ':', mode: 'resources' },
      { prefix: '/', mode: 'filter' },
    ],

    async initialize() {
      // Docker resources are always available, no initialization needed
    },

    getAvailableResourceTypes(): ResourceTypeItem[] {
      // All Docker resource types are always available
      return commandPaletteResourceTypes;
    },

    getNamespaces(): NamespaceItem[] {
      // Docker doesn't have namespaces
      return [];
    },

    resourceTypeToSearchResult(item: ResourceTypeItem): SearchResult {
      return {
        id: `type-${item.kind}`,
        type: 'resource-type',
        label: item.label,
        sublabel: item.aliases?.length ? `${item.category} · ${item.aliases.join(', ')}` : item.category,
        icon: item.icon,
        category: item.category,
        data: {
          dockerResourceType: item.kind as DockerResourceType,
        },
        completionValue: item.kind,
      };
    },

    findResourceType(query: string): ResourceTypeItem | undefined {
      return findResourceTypeByQuery(query);
    },

    async searchResources(query: string, _allScopes: boolean, resourceKind?: string): Promise<SearchResult[]> {
      if (!query || query.length < 2) {
        return [];
      }

      const searchResults: SearchResult[] = [];
      const searchNormalized = normalizeForSearch(query);

      // Determine which resource types to search
      const searchContainers = !resourceKind || resourceKind === 'containers';
      const searchImages = !resourceKind || resourceKind === 'images';

      try {
        const [containers, images] = await Promise.all([
          searchContainers ? listContainers(context, true) : Promise.resolve([]),
          searchImages ? listImages(context) : Promise.resolve([]),
        ]);

        // Search containers
        if (searchContainers) {
          for (const container of containers) {
            const names = container.Names || [];
            const displayName = names[0]?.replace(/^\//, '') || container.Id?.substring(0, 12) || '';
            // URL-friendly name (same as getResourceName in ResourcePage)
            const urlName = displayName;
            if (normalizeForSearch(displayName).includes(searchNormalized)) {
              searchResults.push({
                id: `container/${container.Id}`,
                type: 'resource',
                label: displayName,
                sublabel: `Container · ${container.State || 'unknown'}`,
                icon: Box,
                category: 'Docker',
                data: {
                  dockerResourceType: 'containers' as DockerResourceType,
                  resourceName: urlName,
                },
                completionValue: displayName,
              });
            }
          }
        }

        // Search images
        if (searchImages) {
          for (const image of images) {
            const tags = image.RepoTags || [];
            const displayName = tags[0] || image.Id?.substring(7, 19) || '';
            // URL-friendly name (same as getResourceName in ResourcePage - replace : with -)
            const urlName = displayName.replace(/:/g, '-');
            if (normalizeForSearch(displayName).includes(searchNormalized)) {
              searchResults.push({
                id: `image/${image.Id}`,
                type: 'resource',
                label: displayName,
                sublabel: 'Image',
                icon: Layers,
                category: 'Docker',
                data: {
                  dockerResourceType: 'images' as DockerResourceType,
                  resourceName: urlName,
                },
                completionValue: displayName,
              });
            }
          }
        }
      } catch {
        // Docker API may not be available
      }

      // Sort by relevance (exact match first, then alphabetically)
      searchResults.sort((a, b) => {
        const aExact = normalizeForSearch(a.label) === searchNormalized;
        const bExact = normalizeForSearch(b.label) === searchNormalized;
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        return a.label.localeCompare(b.label);
      });

      return searchResults.slice(0, 50);
    },

    handleSelect(result: SearchResult): void {
      if (result.type === 'resource-type') {
        const resourceType = result.data.dockerResourceType as DockerResourceType | undefined;
        if (resourceType) {
          onSelectResource(resourceType);
        }
      } else if (result.type === 'resource') {
        const resourceType = result.data.dockerResourceType as DockerResourceType | undefined;
        const resourceName = result.data.resourceName as string | undefined;
        if (resourceType && resourceName) {
          onSelectItem(resourceType, resourceName);
        } else if (resourceType) {
          onSelectResource(resourceType);
        }
      }
      onClose();
    },

    getPlaceholder(searchMode: SearchMode): string {
      switch (searchMode) {
        case 'resources':
          return 'Type resource name (e.g., containers, images)...';
        case 'filter':
          return 'Filter current view...';
        default:
          return 'Search containers and images... (:containers, :images, /filter)';
      }
    },

    getHelpItems() {
      return [
        { prefix: ':containers', label: 'Containers (c)' },
        { prefix: ':images', label: 'Images (img)' },
        { prefix: '/', label: 'Filter current view' },
      ];
    },

    getCurrentScopeLabel(): string | null {
      return null;
    },
  };

  return adapter;
}
