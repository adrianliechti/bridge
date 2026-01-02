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
  context: string;
  onSelectResource: (type: DockerResourceType) => void;
  onSelectItem: (type: DockerResourceType, itemId: string) => void;
  onClose: () => void;
}

export function createDockerAdapter(options: DockerAdapterOptions): CommandPaletteAdapter {
  const { context, onSelectResource, onSelectItem, onClose } = options;

  const adapter: CommandPaletteAdapter = {
    id: 'docker',
    resourceTypes: dockerResourceTypes,
    supportsNamespaces: false,
    
    searchModePrefixes: [
      { prefix: '>', mode: 'resources' },
    ],

    async initialize() {
      // Docker resources are always available, no initialization needed
    },

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
          listContainers(context, true),
          listImages(context),
        ]);

        // Search containers
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
            });
          }
        }

        // Search images
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
