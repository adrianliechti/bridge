interface StatusBadgeProps {
  status: string;
  variant?: 'success' | 'warning' | 'error' | 'info' | 'default';
}

export function StatusBadge({ status, variant = 'default' }: StatusBadgeProps) {
  return <span className={`status-badge status-${variant}`}>{status}</span>;
}

// Helper to determine badge variant based on common status values
export function getStatusVariant(status: string): StatusBadgeProps['variant'] {
  const lower = status.toLowerCase();
  
  if (['running', 'active', 'ready', 'available', 'bound', 'succeeded', 'complete', 'healthy'].includes(lower)) {
    return 'success';
  }
  if (['pending', 'creating', 'waiting', 'progressing'].includes(lower)) {
    return 'warning';
  }
  if (['failed', 'error', 'crashloopbackoff', 'terminated', 'unknown', 'lost'].includes(lower)) {
    return 'error';
  }
  if (['terminating', 'released'].includes(lower)) {
    return 'info';
  }
  return 'default';
}

// Convenient wrapper that auto-detects variant
export function AutoStatusBadge({ status }: { status: string }) {
  return <StatusBadge status={status} variant={getStatusVariant(status)} />;
}
