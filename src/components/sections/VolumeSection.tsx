import { useState } from 'react';
import { 
  HardDrive, 
  ChevronDown,
  ChevronRight,
  KeyRound,
  Settings,
  FolderOpen,
  FolderSymlink,
  Network,
  Puzzle,
  FileDown,
  Layers,
  Box,
  Database,
} from 'lucide-react';
import type { VolumeData } from '../adapters/types';

export function VolumesSection({ items }: { items: VolumeData[] }) {
  if (items.length === 0) return null;
  
  return (
    <div className="space-y-2">
      {items.map((volume) => (
        <VolumeCard key={volume.name} volume={volume} />
      ))}
    </div>
  );
}

export function VolumeCard({ volume }: { volume: VolumeData }) {
  const [expanded, setExpanded] = useState(false);

  const typeStyles: Record<string, string> = {
    'ConfigMap': 'border-blue-500/30 bg-blue-500/5',
    'Secret': 'border-amber-500/30 bg-amber-500/5',
    'PVC': 'border-emerald-500/30 bg-emerald-500/5',
    'EmptyDir': 'border-neutral-500/30 bg-neutral-500/5',
    'HostPath': 'border-red-500/30 bg-red-500/5',
    'Projected': 'border-purple-500/30 bg-purple-500/5',
    'DownwardAPI': 'border-cyan-500/30 bg-cyan-500/5',
    'NFS': 'border-orange-500/30 bg-orange-500/5',
    'CSI': 'border-indigo-500/30 bg-indigo-500/5',
  };

  const typeIcons: Record<string, React.ReactNode> = {
    'ConfigMap': <Settings size={14} className="text-blue-400" />,
    'Secret': <KeyRound size={14} className="text-amber-400" />,
    'PVC': <Database size={14} className="text-emerald-400" />,
    'EmptyDir': <FolderOpen size={14} className="text-neutral-400" />,
    'HostPath': <FolderSymlink size={14} className="text-red-400" />,
    'Projected': <Layers size={14} className="text-purple-400" />,
    'DownwardAPI': <FileDown size={14} className="text-cyan-400" />,
    'NFS': <Network size={14} className="text-orange-400" />,
    'CSI': <Puzzle size={14} className="text-indigo-400" />,
  };

  const typeBadgeStyles: Record<string, string> = {
    'ConfigMap': 'bg-blue-500/20 text-blue-400',
    'Secret': 'bg-amber-500/20 text-amber-400',
    'PVC': 'bg-emerald-500/20 text-emerald-400',
    'EmptyDir': 'bg-neutral-500/20 text-neutral-400',
    'HostPath': 'bg-red-500/20 text-red-400',
    'Projected': 'bg-purple-500/20 text-purple-400',
    'DownwardAPI': 'bg-cyan-500/20 text-cyan-400',
    'NFS': 'bg-orange-500/20 text-orange-400',
    'CSI': 'bg-indigo-500/20 text-indigo-400',
  };

  return (
    <div className={`border rounded-lg overflow-hidden ${typeStyles[volume.type] || 'border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-900/50'}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-neutral-200/50 dark:hover:bg-neutral-800/30 transition-colors"
      >
        {expanded ? (
          <ChevronDown size={14} className="text-neutral-600 dark:text-neutral-500" />
        ) : (
          <ChevronRight size={14} className="text-neutral-600 dark:text-neutral-500" />
        )}
        {typeIcons[volume.type] || <HardDrive size={14} className="text-neutral-600 dark:text-neutral-400" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{volume.name}</span>
          </div>
          <div className="text-xs text-neutral-600 dark:text-neutral-500 truncate">
            {volume.source && <span className="text-cyan-600 dark:text-cyan-400/70">{volume.source}</span>}
            {volume.mounts.length > 0 && (
              <span className="ml-2">→ {volume.mounts.map(m => m.mountPath).join(', ')}</span>
            )}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-neutral-200 dark:border-neutral-800 p-3 space-y-3">
          {/* Source Info */}
          <div>
            <div className="text-xs text-neutral-600 dark:text-neutral-500 mb-1">Source</div>
            <div className="text-xs">
              <span className={`px-1.5 py-0.5 rounded ${typeBadgeStyles[volume.type] || 'bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400'}`}>
                {volume.type}
              </span>
              {volume.source && (
                <span className="ml-2 text-cyan-600 dark:text-cyan-400">{volume.source}</span>
              )}
            </div>
            {/* Extra source details */}
            {volume.extra && Object.keys(volume.extra).length > 0 && (
              <div className="mt-2 text-xs space-y-1">
                {Object.entries(volume.extra).map(([key, value]) => (
                  <div key={key} className="text-neutral-600 dark:text-neutral-400">
                    <span className="text-neutral-500">{key}:</span> <span className="text-neutral-900 dark:text-neutral-300">{String(value)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Mount Points */}
          {volume.mounts.length > 0 && (
            <div>
              <div className="text-xs text-neutral-600 dark:text-neutral-500 mb-1">Mount Points</div>
              <div className="space-y-2">
                {volume.mounts.map((mount, i) => (
                  <div key={i} className="text-xs bg-neutral-100 dark:bg-neutral-900/50 rounded p-2">
                    <div className="flex items-center gap-2">
                      <Box size={10} className="text-blue-400" />
                      <span className="text-neutral-900 dark:text-neutral-300">{mount.container}</span>
                      <span className="text-neutral-600 dark:text-neutral-500">→</span>
                      <span className="text-cyan-600 dark:text-cyan-400 font-mono">{mount.mountPath}</span>
                      {mount.readOnly && (
                        <span className="px-1 py-0.5 rounded bg-amber-500/20 text-amber-400 text-[10px]">read-only</span>
                      )}
                    </div>
                    {mount.subPath && (
                      <div className="ml-4 mt-1 text-neutral-600 dark:text-neutral-500">
                        <span className="text-neutral-600 dark:text-neutral-500">subPath:</span> <span className="text-purple-600 dark:text-purple-400">{mount.subPath}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
