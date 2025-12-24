// Calculate age from timestamp
export function formatAge(timestamp: string | undefined): string {
  if (!timestamp) return 'Unknown';
  
  const created = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();
  
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

// Format labels as a string
export function formatLabels(labels: Record<string, string> | undefined): string {
  if (!labels) return '-';
  return Object.entries(labels)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');
}

// Truncate string with ellipsis
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}
