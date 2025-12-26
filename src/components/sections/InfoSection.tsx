import { Box, Tag } from 'lucide-react';
import type { InfoRowData } from '../adapters/types';

export function InfoGridSection({ items, columns = 2 }: { items: InfoRowData[]; columns?: 1 | 2 }) {
  const filteredItems = items.filter(item => item.value !== undefined && item.value !== null);
  
  return (
    <div className={`bg-neutral-100 dark:bg-neutral-900/50 rounded-lg p-3 grid gap-2 text-xs ${
      columns === 2 ? 'grid-cols-2' : 'grid-cols-1'
    }`}>
      {filteredItems.map((item, i) => (
        <div key={i} className="overflow-hidden">
          <span className="text-neutral-500 dark:text-neutral-500">{item.label}:</span>{' '}
          <span className={item.color || 'text-neutral-900 dark:text-neutral-300'}>{item.value}</span>
        </div>
      ))}
    </div>
  );
}

export function LabelsSection({ labels, title = 'Labels' }: { labels: Record<string, string>; title?: string }) {
  const entries = Object.entries(labels);
  if (entries.length === 0) return null;

  // Sort important labels first
  const importantPrefixes = [
    'node-role.kubernetes.io/',
    'kubernetes.io/os',
    'kubernetes.io/arch',
    'node.kubernetes.io/instance-type',
    'topology.kubernetes.io/',
  ];

  const sortedEntries = [...entries].sort((a, b) => {
    const aImportant = importantPrefixes.some(p => a[0].startsWith(p));
    const bImportant = importantPrefixes.some(p => b[0].startsWith(p));
    if (aImportant && !bImportant) return -1;
    if (!aImportant && bImportant) return 1;
    return 0;
  });

  return (
    <div>
      <h5 className="flex items-center gap-2 text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2">
        <Tag size={12} />
        {title}
      </h5>
      <table className="w-full text-xs table-fixed">
        <colgroup>
          <col className="w-[40%]" />
          <col className="w-[60%]" />
        </colgroup>
        <tbody>
          {sortedEntries.map(([key, value], index) => {
            const isImportant = importantPrefixes.some(p => key.startsWith(p));
            return (
              <tr key={key} className={index % 2 === 0 ? 'bg-neutral-50 dark:bg-neutral-800/30' : ''}>
                <td className={`py-1.5 px-2 truncate ${isImportant ? 'text-blue-600 dark:text-blue-400' : 'text-sky-600 dark:text-sky-400'}`} title={key}>
                  {key}
                </td>
                <td className="py-1.5 px-2 text-emerald-600 dark:text-emerald-400 truncate" title={value}>
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

export function ContainerImagesSection({ containers }: { containers: Array<{ name: string; image?: string }> }) {
  return (
    <div className="space-y-1">
      {containers.map(container => (
        <div key={container.name} className="text-xs bg-neutral-100 dark:bg-neutral-900/50 px-2 py-1.5 rounded flex items-center gap-2">
          <Box size={12} className="text-blue-400" />
          <span className="text-neutral-900 dark:text-neutral-300">{container.name}:</span>
          <span className="text-cyan-400 truncate">{container.image}</span>
        </div>
      ))}
    </div>
  );
}

export function AddressesSection({ addresses }: { addresses: Array<{ type: string; address: string }> }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {addresses.map((addr, i) => (
        <div key={i} className="bg-neutral-900/50 rounded-lg p-2">
          <div className="text-xs text-neutral-500">{addr.type}</div>
          <div className="text-sm text-cyan-400 font-mono">{addr.address}</div>
        </div>
      ))}
    </div>
  );
}
