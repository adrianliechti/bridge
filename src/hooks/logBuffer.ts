export const MAX_LOG_LINES = 5000;

// Batch busy streams and retain a bounded history without copying the full
// history for every incoming line.
export function createLogBuffer<T>(
  publish: (snapshot: { entries: T[]; dropped: number }) => void,
  limit = MAX_LOG_LINES,
) {
  if (!Number.isInteger(limit) || limit < 1)
    throw new Error('Log limit must be a positive integer');
  const entries: T[] = [];
  let count = 0;
  let start = 0;
  let dropped = 0;
  let disposed = false;
  let dirty = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    if (disposed || !dirty) return;
    dirty = false;
    publish({
      entries: Array.from({ length: count }, (_, index) => entries[(start + index) % limit]),
      dropped,
    });
  };

  return {
    push(entry: T) {
      if (disposed) return;
      if (count < limit) {
        entries[(start + count) % limit] = entry;
        count++;
      } else {
        entries[start] = entry;
        start = (start + 1) % limit;
        dropped++;
      }
      dirty = true;
      timer ??= setTimeout(flush, 100);
    },
    flush,
    dispose() {
      disposed = true;
      clearTimeout(timer);
    },
  };
}
