import { Box, Layers } from 'lucide-react';
import { listContainers, listImages } from '../../api/docker/docker';
import type {
  CommandPaletteAdapter,
  ResourceTypeItem,
  NamespaceItem,
  SearchResult,
  SearchMode,
} from '../../types/commandPalette';

export type DockerResourceType = 'containers' | 'images';

// Normalize string for fuzzy matching (remove hyphens, underscores, dots)
function normalizeForSearch(str: string): string {
  return str.toLowerCase().replace(/[-_.]/g, '');
}

// Docker resource types with icons
const dockerResourceTypes: ResourceTypeItem[] = [
  { kind: 'containers', label: 'Containers', icon: Box, category: 'Docker' },
  { kind: 'images', label: 'Images', icon: Layers, category: 'Docker' },
];

interface DockerAdapterOptions {
  onSelectResource: (type: DockerResourceType) => void;
  onClose: () => void;
}

export function createDockerAdapter(options: DockerAdapterOptions): CommandPaletteAdapter {
  const { onSelectResource, onClose } = options;

  const adapter: CommandPaletteAdapter = {
    id: 'docker',
    resourceTypes: dockerResourceTypes,
    supportsNamespaces: false,
    
    searchModePrefixes: [
      { prefix: '>', mode: 'resources' },
    ],

    getAvailableResourceTypes(): ResourceTypeItem[] {
      // All Docker resource types are always available
      return dockerResourceTypes;
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
        sublabel: item.category,
        icon: item.icon,
        category: item.category,
        data: {
          dockerResourceType: item.kind as DockerResourceType,
        },
      };
    },

    async searchResources(query: string): Promise<SearchResult[]> {
      if (!query || query.length < 2) {
        return [];
      }

      const searchResults: SearchResult[] = [];
      const searchNormalized = normalizeForSearch(query);

      try {
        const [containers, images] = await Promise.all([
          listContainers(true),
          listImages(),
        ]);

        // Search containers
        for (const container of containers) {
          const names = container.Names || [];
          const name = names[0]?.replace(/^\//, '') || container.Id?.substring(0, 12) || '';
          if (normalizeForSearch(name).includes(searchNormalized)) {
            searchResults.push({
              id: `container/${container.Id}`,
              type: 'resource',
              label: name,
              sublabel: `Container · ${container.State || 'unknown'}`,
              icon: Box,
              category: 'Docker',
              data: {
                dockerResourceType: 'containers' as DockerResourceType,
                resourceId: container.Id,
                resourceName: name,
              },
            });
          }
        }

        // Search images
        for (const image of images) {
          const tags = image.RepoTags || [];
          const name = tags[0] || image.Id?.substring(7, 19) || '';
          if (normalizeForSearch(name).includes(searchNormalized)) {
            searchResults.push({
              id: `image/${image.Id}`,
              type: 'resource',
              label: name,
              sublabel: 'Image',
              icon: Layers,
              category: 'Docker',
              data: {
                dockerResourceType: 'images' as DockerResourceType,
                resourceId: image.Id,
                resourceName: name,
              },
            });
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
      if (result.type === 'resource-type' || result.type === 'resource') {
        const resourceType = result.data.dockerResourceType as DockerResourceType | undefined;
        if (resourceType) {
          onSelectResource(resourceType);
        }
      }
      onClose();
    },

    getPlaceholder(searchMode: SearchMode): string {
      switch (searchMode) {
        case 'resources':
          return 'Search resource types...';
        default:
          return 'Search containers and images... (> types)';
      }
    },

    getHelpItems() {
      return [
        { prefix: '>', label: 'Resource types' },
      ];
    },

    getCurrentScopeLabel(): string | null {
      return null;
    },
  };

  return adapter;
}
