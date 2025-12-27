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

  return (
    <div className="space-y-4">
      {/* Labels */}
      {filteredLabels && Object.keys(filteredLabels).length > 0 && (
        <section className="mb-4">
          <h4 className="text-xs font-medium uppercase tracking-wider text-neutral-600 dark:text-neutral-400 mb-2">
            Labels
          </h4>
          <div className="bg-neutral-100 dark:bg-neutral-800/50 rounded-lg p-4">
            <table className="w-full text-xs">
              <tbody>
                {Object.entries(filteredLabels).map(([key, value]) => (
                  <tr key={key} className="border-b border-neutral-200 dark:border-neutral-700/50 last:border-0">
                    <td className="py-1.5 pr-3 text-sky-600 dark:text-sky-400 align-top whitespace-nowrap">
                      {key}
                    </td>
                    <td className="py-1.5 text-emerald-600 dark:text-emerald-400 break-all">
                      {value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Annotations */}
      {filteredAnnotations && Object.keys(filteredAnnotations).length > 0 && (
        <section className="mb-4">
          <h4 className="text-xs font-medium uppercase tracking-wider text-neutral-600 dark:text-neutral-400 mb-2">
            Annotations
          </h4>
          <div className="bg-neutral-100 dark:bg-neutral-800/50 rounded-lg p-4">
            <table className="w-full text-xs">
              <tbody>
                {Object.entries(filteredAnnotations).map(([key, value]) => (
                  <tr key={key} className="border-b border-neutral-200 dark:border-neutral-700/50 last:border-0">
                    <td className="py-1.5 pr-3 text-purple-600 dark:text-purple-400 align-top whitespace-nowrap">
                      {key}
                    </td>
                    <td className="py-1.5 text-neutral-600 dark:text-neutral-300 break-all">
                      {value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
