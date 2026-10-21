import { LabelsSection } from './InfoSection';

// Metadata section with nice visualization of labels/annotations
export function MetadataView({ metadata }: { metadata: Record<string, unknown> }) {
  const labels = metadata.labels as Record<string, string> | undefined;
  const annotations = metadata.annotations as Record<string, string> | undefined;

  // Labels that are typically not useful for users (internal/auto-generated)
  const hiddenLabels = new Set<string>([
    'pod-template-hash',
    'controller-revision-hash',
    'pod-template-generation',
  ]);

  // Annotations that are too verbose or internal
  const hiddenAnnotations = new Set<string>([
    'kubectl.kubernetes.io/last-applied-configuration',
    'deployment.kubernetes.io/revision',
    'control-plane.alpha.kubernetes.io/leader',
    'deprecated.daemonset.template.generation',
    'kubernetes.io/description',
  ]);

  const filteredLabels = labels
    ? Object.fromEntries(Object.entries(labels).filter(([key]) => !hiddenLabels.has(key)))
    : undefined;

  const filteredAnnotations = annotations
    ? Object.fromEntries(Object.entries(annotations).filter(([key]) => !hiddenAnnotations.has(key)))
    : undefined;

  const hasLabels = Object.keys(filteredLabels ?? {}).length > 0;
  const hasAnnotations = Object.keys(filteredAnnotations ?? {}).length > 0;

  if (!hasLabels && !hasAnnotations) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-200 px-5 py-8 text-center dark:border-neutral-700">
        <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          No labels or annotations to display
        </p>
        <p className="mt-1 text-xs text-neutral-500">
          The Manifest tab includes all resource metadata, including generated fields.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {hasLabels && <LabelsSection labels={filteredLabels!} />}
      {hasAnnotations && <LabelsSection labels={filteredAnnotations!} title="Annotations" />}
    </div>
  );
}
