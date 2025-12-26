// Utility functions for panels

// Get container state styling info
export function getContainerStateInfo(state?: string, reason?: string) {
  if (state === 'running') {
    return {
      label: 'Running',
      borderClass: 'border-emerald-500/30 bg-emerald-500/5',
      badgeClass: 'bg-emerald-500/20 text-emerald-400',
      iconClass: 'text-emerald-400',
    };
  }
  if (state === 'waiting') {
    const isError = reason === 'CrashLoopBackOff' || reason === 'Error';
    return {
      label: reason || 'Waiting',
      borderClass: isError ? 'border-red-500/30 bg-red-500/5' : 'border-amber-500/30 bg-amber-500/5',
      badgeClass: isError ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400',
      iconClass: isError ? 'text-red-400' : 'text-amber-400',
    };
  }
  if (state === 'terminated') {
    return {
      label: reason || 'Terminated',
      borderClass: 'border-neutral-300 bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900/50',
      badgeClass: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-400',
      iconClass: 'text-neutral-500 dark:text-neutral-400',
    };
  }
  return {
    label: 'Unknown',
    borderClass: 'border-neutral-300 bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900/50',
    badgeClass: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-400',
    iconClass: 'text-neutral-500 dark:text-neutral-400',
  };
}

