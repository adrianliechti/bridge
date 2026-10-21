import { Box, Tag } from 'lucide-react';
import type { InfoRowData } from './types';

export function InfoGridSection({
  items,
  columns = 2,
}: {
  items: InfoRowData[];
  columns?: 1 | 2 | 3;
}) {
  const filteredItems = items.filter((item) => item.value !== undefined && item.value !== null);

  const gridClass =
    columns === 3
      ? 'grid-cols-1 @sm:grid-cols-2 @xl:grid-cols-3'
      : columns === 2
        ? 'grid-cols-1 @sm:grid-cols-2'
        : 'grid-cols-1';
  if (filteredItems.length === 0) return null;

  return (
    <dl
      className={`rounded-lg border border-neutral-200 bg-neutral-50/70 p-4 grid gap-x-6 gap-y-4 text-xs dark:border-neutral-800 dark:bg-neutral-950/30 ${gridClass}`}
    >
      {filteredItems.map((item, i) => (
        <div key={i} className="min-w-0">
          <dt className="mb-1 text-neutral-500 dark:text-neutral-400">{item.label}</dt>
          <dd
            className={`break-words [overflow-wrap:anywhere] font-medium leading-relaxed ${item.color || 'text-neutral-900 dark:text-neutral-200'}`}
          >
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function LabelsSection({
  labels,
  title = 'Labels',
}: {
  labels: Record<string, string>;
  title?: string;
}) {
  const entries = Object.entries(labels);
  if (entries.length === 0)
    return (
      <div className="rounded-lg border border-dashed border-neutral-200 px-5 py-8 text-center text-sm text-neutral-500 dark:border-neutral-700">
        No {title.toLowerCase()} to display
      </div>
    );

  // Sort important labels first
  const importantPrefixes = [
    'node-role.kubernetes.io/',
    'kubernetes.io/os',
    'kubernetes.io/arch',
    'node.kubernetes.io/instance-type',
    'topology.kubernetes.io/',
  ];

  const sortedEntries = [...entries].sort((a, b) => {
    const aImportant = importantPrefixes.some((p) => a[0].startsWith(p));
    const bImportant = importantPrefixes.some((p) => b[0].startsWith(p));
    if (aImportant && !bImportant) return -1;
    if (!aImportant && bImportant) return 1;
    return 0;
  });

  return (
    <div>
      <h5 className="flex items-center gap-2 text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-3">
        <Tag size={12} />
        {title}
      </h5>
      <table className="w-full table-fixed text-xs">
        <tbody>
          {sortedEntries.map(([key, value], index) => {
            const isImportant = importantPrefixes.some((p) => key.startsWith(p));
            return (
              <tr
                key={key}
                className={index % 2 === 0 ? 'bg-neutral-50 dark:bg-neutral-800/30' : ''}
              >
                <td
                  className={`py-2.5 px-3 align-top w-[45%] [overflow-wrap:anywhere] ${isImportant ? 'text-blue-700 dark:text-blue-400' : 'text-neutral-600 dark:text-neutral-400'}`}
                  title={key}
                >
                  {key}
                </td>
                <td
                  className="py-2.5 px-3 align-top text-neutral-900 dark:text-neutral-200 [overflow-wrap:anywhere] whitespace-pre-wrap"
                  title={value}
                >
                  {value}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ContainerImagesSection({
  containers,
}: {
  containers: Array<{ name: string; image?: string }>;
}) {
  return (
    <div className="space-y-1">
      {containers.map((container) => (
        <div
          key={container.name}
          className="text-xs bg-neutral-100 dark:bg-neutral-900/50 px-3 py-2 rounded flex items-start gap-2"
        >
          <Box size={12} className="mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" />
          <span className="text-neutral-900 dark:text-neutral-300 break-all">
            {container.name}:
          </span>
          <span
            className="min-w-0 [overflow-wrap:anywhere] text-cyan-700 dark:text-cyan-400"
            title={container.image}
          >
            {container.image}
          </span>
        </div>
      ))}
    </div>
  );
}

export function AddressesSection({
  addresses,
}: {
  addresses: Array<{ type: string; address: string }>;
}) {
  return (
    <div className="grid grid-cols-1 @sm:grid-cols-2 gap-2">
      {addresses.map((addr, i) => (
        <div key={i} className="bg-neutral-100 dark:bg-neutral-900/50 rounded-lg p-2">
          <div className="text-xs text-neutral-600 dark:text-neutral-500">{addr.type}</div>
          <div className="text-sm text-cyan-600 dark:text-cyan-400 font-mono break-all">
            {addr.address}
          </div>
        </div>
      ))}
    </div>
  );
}
