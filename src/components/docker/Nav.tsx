import { Box, Layers, HardDrive, Network } from 'lucide-react';

export type DockerResourceType = 'containers' | 'images' | 'volumes' | 'networks';

interface NavProps {
  selectedResource: DockerResourceType;
  onSelectResource: (resource: DockerResourceType) => void;
}

const navItems: { id: DockerResourceType; label: string; icon: React.ComponentType<{ size: number; className?: string }> }[] = [
  { id: 'containers', label: 'Containers', icon: Box },
  { id: 'images', label: 'Images', icon: Layers },
  { id: 'volumes', label: 'Volumes', icon: HardDrive },
  { id: 'networks', label: 'Networks', icon: Network },
];

export function Nav({ selectedResource, onSelectResource }: NavProps) {
  return (
    <nav className="flex-1 py-1 overflow-y-auto overflow-x-hidden min-h-0">
      <ul className="px-2">
        {navItems.map((item) => {
          const isActive = selectedResource === item.id;
          return (
            <li key={item.id}>
              <button
                className={`flex items-center w-full px-3 py-2 text-sm rounded-lg transition-colors ${
                  isActive
                    ? 'bg-white/90 text-neutral-900 shadow-sm dark:bg-neutral-800 dark:text-neutral-100'
                    : 'text-neutral-600 hover:bg-white/50 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800/50 dark:hover:text-neutral-200'
                }`}
                onClick={() => onSelectResource(item.id)}
              >
                <item.icon size={16} className="mr-2.5 shrink-0 opacity-70" />
                <span className="truncate">{item.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
