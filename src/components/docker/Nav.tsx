import { dockerResourceTypes, type DockerResourceType } from './resourceTypes';

export type { DockerResourceType };

interface NavProps {
  selectedResource: DockerResourceType | null;
  onSelectResource: (resource: DockerResourceType) => void;
  isWelcome?: boolean;
}

export function Nav({ selectedResource, onSelectResource, isWelcome }: NavProps) {
  return (
    <nav className="flex-1 py-1 overflow-y-auto overflow-x-hidden min-h-0">
      <ul className="px-2">
        {dockerResourceTypes.map((item) => {
          const isActive = !isWelcome && selectedResource === item.kind;
          return (
            <li key={item.kind}>
              <button
                className={`flex items-center w-full px-3 py-2 text-sm rounded-lg transition-colors ${
                  isActive
                    ? 'bg-white/90 text-neutral-900 shadow-sm dark:bg-neutral-800 dark:text-neutral-100'
                    : 'text-neutral-600 hover:bg-white/50 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800/50 dark:hover:text-neutral-200'
                }`}
                onClick={() => onSelectResource(item.kind)}
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
