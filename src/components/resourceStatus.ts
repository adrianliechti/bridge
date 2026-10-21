export function getResourceStatus(value: string): 'success' | 'warning' | 'error' | 'neutral' {
  const status = value.trim().toLowerCase();
  // Check negative states first: "NotReady" and "unhealthy" contain positive words.
  if (
    /not[\s-]?ready|unhealthy|unavailable|inactive|failed|error|crashloopbackoff|terminated|unknown|lost|false/.test(
      status,
    )
  ) {
    return 'error';
  }
  if (/pending|creating|waiting|progressing|scheduled|terminating|degraded/.test(status)) {
    return 'warning';
  }
  const readiness = status.match(/^(\d+)\/(\d+)$/);
  if (readiness) {
    const [, ready, total] = readiness;
    return Number(total) === 0 ? 'neutral' : ready === total ? 'success' : 'warning';
  }
  if (
    /\b(running|active|ready|available|bound|succeeded|complete|completed|healthy|true)\b/.test(
      status,
    )
  ) {
    return 'success';
  }
  return 'neutral';
}
