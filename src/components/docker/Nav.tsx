import { dockerResourceTypes, type DockerResourceType } from './resourceTypes';

export type { DockerResourceType };

interface NavProps {
  selectedResource: DockerResourceType | null;
  onSelectResource: (resource: DockerResourceType) => void;
  isWelcome?: boolean;
}

export function Nav({ selectedResource, onSelectResource, isWelcome }: NavProps) {
  return (
    <nav className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 px-2 pb-3">
      <ul>
        {dockerResourceTypes.map((item) => {
          const isActive = !isWelcome && selectedResource === item.kind;
          return (
            <li key={item.kind}>
              <button
                className="sidebar-item"
                aria-current={isActive ? 'page' : undefined}
                onClick={() => onSelectResource(item.kind)}
              >
                <item.icon size={16} />
                <span className="truncate">{item.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
