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
    ? Object.fromEntries(
        Object.entries(labels).filter(([key]) => !hiddenLabels.has(key))
      )
    : undefined;
  
  const filteredAnnotations = annotations 
    ? Object.fromEntries(
        Object.entries(annotations).filter(([key]) => !hiddenAnnotations.has(key))
      )
    : undefined;

  // Combine all entries into a single table for aligned columns
  const allEntries: Array<{ key: string; value: string; type: 'label' | 'annotation' }> = [
    ...Object.entries(filteredLabels ?? {}).map(([key, value]) => ({ key, value, type: 'label' as const })),
    ...Object.entries(filteredAnnotations ?? {}).map(([key, value]) => ({ key, value, type: 'annotation' as const })),
  ];

  const hasLabels = filteredLabels && Object.keys(filteredLabels).length > 0;
  const hasAnnotations = filteredAnnotations && Object.keys(filteredAnnotations).length > 0;

  if (allEntries.length === 0) {
    return null;
  }

  return (
    <div className="bg-neutral-100 dark:bg-neutral-800/50 rounded-lg p-4">
      <table className="w-full text-xs">
        <tbody>
          {/* Labels section */}
          {hasLabels && (
            <>
              <tr>
                <td colSpan={2} className="pb-2">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-500">
                    Labels
                  </span>
                </td>
              </tr>
              {Object.entries(filteredLabels!).map(([key, value]) => (
                <tr key={`label-${key}`} className="border-b border-neutral-200 dark:border-neutral-700/50">
                  <td className="py-1.5 pr-3 text-sky-600 dark:text-sky-400 align-top whitespace-nowrap w-[1%]">
                    {key}
                  </td>
                  <td className="py-1.5 text-emerald-600 dark:text-emerald-400 break-all">
                    {value}
                  </td>
                </tr>
              ))}
            </>
          )}
          
          {/* Annotations section */}
          {hasAnnotations && (
            <>
              <tr>
                <td colSpan={2} className={hasLabels ? 'pt-4 pb-2' : 'pb-2'}>
                  <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-500">
                    Annotations
                  </span>
                </td>
              </tr>
              {Object.entries(filteredAnnotations!).map(([key, value], idx, arr) => (
                <tr key={`annotation-${key}`} className={idx < arr.length - 1 ? 'border-b border-neutral-200 dark:border-neutral-700/50' : ''}>
                  <td className="py-1.5 pr-3 text-purple-600 dark:text-purple-400 align-top whitespace-nowrap w-[1%]">
                    {key}
                  </td>
                  <td className="py-1.5 text-neutral-600 dark:text-neutral-300 break-all">
                    {value}
                  </td>
                </tr>
              ))}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}
