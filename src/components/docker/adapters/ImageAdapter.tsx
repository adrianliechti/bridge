// Docker Image Adapter
// Extracts display data from Docker images

import { createElement } from 'react';
import { Layers, Tag } from 'lucide-react';
import type { DockerAdapter, StatusCardData, InfoRowData, Section } from './types';
import type { DockerImage } from '../../../api/docker/docker';
import { removeImage, formatImageSize } from '../../../api/docker/docker';
import { createDeleteAction } from '../../sections/actionHelpers';

// Format unix timestamp to date string
function formatUnixTime(timestamp?: number): string {
  if (!timestamp) return 'Unknown';
  return new Date(timestamp * 1000).toLocaleString();
}

// Parse Docker image reference into repository and tag
// Handles: nginx:latest, registry.com:5000/image:tag, image@sha256:..., etc.
function parseImageRef(ref: string): { repository: string; tag: string } {
  if (!ref || ref === '<none>:<none>') {
    return { repository: '<none>', tag: '<none>' };
  }

  // Handle digest references (image@sha256:...)
  if (ref.includes('@')) {
    const [repo, digest] = ref.split('@');
    return { repository: repo, tag: digest };
  }

  // Find the last colon that's part of the tag (not port)
  // The tag portion starts after the last '/' or the beginning
  const lastSlash = ref.lastIndexOf('/');
  const afterSlash = lastSlash >= 0 ? ref.substring(lastSlash + 1) : ref;
  const colonInName = afterSlash.lastIndexOf(':');
  
  if (colonInName >= 0) {
    // There's a tag
    const tagStart = lastSlash >= 0 ? lastSlash + 1 + colonInName : colonInName;
    return {
      repository: ref.substring(0, tagStart),
      tag: ref.substring(tagStart + 1),
    };
  }
  
  // No tag, just repository
  return { repository: ref, tag: 'latest' };
}

export const ImageAdapter: DockerAdapter<DockerImage> = {
  types: ['image'],

  adapt(_context, image): { sections: Section[] } {
    const sections: Section[] = [];

    // Parse repo tags
    const repoTags = image.RepoTags ?? [];
    const repoDigests = image.RepoDigests ?? [];
    const primaryTag = repoTags[0] || '<none>:<none>';
    const { repository, tag } = parseImageRef(primaryTag);

    // Status section
    const statusCards: StatusCardData[] = [
      {
        label: 'Size',
        value: formatImageSize(image.Size),
        status: 'neutral',
        icon: createElement(Layers, { size: 14 }),
      },
    ];

    if (repoTags.length > 0) {
      statusCards.push({
        label: 'Tags',
        value: repoTags.length,
        status: 'neutral',
        icon: createElement(Tag, { size: 14 }),
      });
    }

    if (image.Containers !== undefined && image.Containers >= 0) {
      statusCards.push({
        label: 'Containers',
        value: image.Containers,
        status: image.Containers > 0 ? 'success' : 'neutral',
      });
    }

    sections.push({
      id: 'status',
      data: { type: 'status-cards', items: statusCards },
    });

    // Info section
    const infoItems: InfoRowData[] = [
      { label: 'Repository', value: repository !== '<none>' ? repository : undefined },
      { label: 'Tag', value: tag !== '<none>' ? tag : undefined },
      { label: 'Image ID', value: image.Id?.replace('sha256:', '').substring(0, 12) },
      { label: 'Full ID', value: image.Id?.replace('sha256:', '') },
      { label: 'Size', value: formatImageSize(image.Size) },
      { label: 'Virtual Size', value: image.VirtualSize ? formatImageSize(image.VirtualSize) : undefined },
      { label: 'Created', value: formatUnixTime(image.Created) },
    ];

    if (image.ParentId) {
      infoItems.push({ label: 'Parent', value: image.ParentId.replace('sha256:', '').substring(0, 12) });
    }

    sections.push({
      id: 'info',
      title: 'Information',
      data: { type: 'info-grid', items: infoItems.filter(item => item.value) },
    });

    // Tags section
    if (repoTags.length > 1) {
      const tagItems: InfoRowData[] = repoTags.map((repoTag) => {
        const parsed = parseImageRef(repoTag);
        return { label: parsed.repository, value: parsed.tag };
      });

      sections.push({
        id: 'tags',
        title: 'Tags',
        data: { type: 'info-grid', items: tagItems },
      });
    }

    // Digests section
    if (repoDigests.length > 0) {
      const digestItems: InfoRowData[] = repoDigests.map((digest) => {
        const [repo, hash] = digest.split('@');
        return { label: repo, value: hash?.substring(7, 19) + '...' };
      });

      sections.push({
        id: 'digests',
        title: 'Digests',
        data: { type: 'info-grid', items: digestItems },
      });
    }

    // Labels section
    const labels = image.Labels;
    if (labels && Object.keys(labels).length > 0) {
      sections.push({
        id: 'labels',
        data: { type: 'labels', labels },
      });
    }

    return { sections };
  },

  actions: [
    createDeleteAction(
      async (context, resource) => {
        await removeImage(context, (resource as DockerImage).Id!);
      },
      {
        message: 'Are you sure you want to delete this image? This action cannot be undone.',
        isDisabled: (resource) => {
          const image = resource as DockerImage;
          if (image.Containers && image.Containers > 0) {
            return 'Image is used by containers';
          }
          return false;
        },
      }
    ),
  ],
};
