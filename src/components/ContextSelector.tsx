import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Server, Container } from 'lucide-react';
import { getDockerContextLabel } from '../config';

export const DOCKER_CONTEXT = 'docker';

interface ContextSelectorProps {
  mode?: 'cluster' | 'docker';
  contexts: string[];
  selectedContext: string;
  onSelectContext: (context: string) => void;
  dockerContexts?: string[];
  selectedDockerContext?: string;
  onSelectDockerContext?: (context: string) => void;
}

export function ContextSelector({
  mode,
  contexts,
  selectedContext,
  onSelectContext,
  dockerContexts = [],
  selectedDockerContext,
  onSelectDockerContext,
}: ContextSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleSelect = (contextName: string, isDocker: boolean) => {
    if (isDocker) {
      if (onSelectDockerContext) {
        onSelectDockerContext(contextName);
      }
    } else {
      onSelectContext(contextName);
    }
    setIsOpen(false);
  };

  // Determine what's currently selected for display
  const isDockerMode = mode === 'docker';
  const displayContext = isDockerMode ? selectedDockerContext || DOCKER_CONTEXT : selectedContext;
  const displayLabel = isDockerMode
    ? getDockerContextLabel(displayContext)
    : { label: displayContext, detail: undefined };
  const DisplayIcon = isDockerMode ? Container : Server;

  // Calculate total contexts available
  const totalKubernetesContexts = contexts.length;
  const totalDockerContexts = dockerContexts.length;
  const totalContexts = totalKubernetesContexts + totalDockerContexts;

  // Hide selector if there's only one context total (or none)
  // Show if: multiple k8s, multiple docker, or at least one of each
  if (totalContexts <= 1) {
    return null;
  }

  return (
    <div className="relative" ref={containerRef}>
      <button type="button" onClick={() => setIsOpen(!isOpen)} className="sidebar-item group">
        <DisplayIcon size={16} />
        <span className="truncate flex-1 text-left" title={displayContext}>
          {displayLabel.label}
          {displayLabel.detail && <span className="text-fg-dim"> · {displayLabel.detail}</span>}
        </span>
        <ChevronDown
          size={14}
          className={`text-fg-dim transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-bg-elevated rounded-lg shadow-xl max-h-64 overflow-y-auto border border-border">
          <div className="py-1">
            {/* Docker contexts */}
            {dockerContexts.length > 0 && (
              <>
                <div className="px-3 py-1 text-[11px] font-semibold text-fg-dim">Containers</div>
                {dockerContexts.map((ctx) => {
                  const isSelected = isDockerMode && selectedDockerContext === ctx;
                  const { label, detail } = getDockerContextLabel(ctx);

                  return (
                    <div
                      key={`docker-${ctx}`}
                      onClick={() => handleSelect(ctx, true)}
                      className={`mx-1 px-2.5 py-1.5 rounded-md cursor-pointer text-sm flex items-center justify-between hover:bg-bg-hover ${
                        isSelected ? 'text-fg' : 'text-fg-muted'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Container size={14} className="opacity-50 shrink-0" />
                        <span className="truncate" title={ctx}>
                          {label}
                          {detail && <span className="text-fg-dim"> {detail}</span>}
                        </span>
                      </div>
                      {isSelected && <Check size={14} className="text-fg-muted shrink-0" />}
                    </div>
                  );
                })}
              </>
            )}

            {/* Kubernetes clusters */}
            {contexts.length > 0 && (
              <>
                <div
                  className={`px-3 py-1 text-[11px] font-semibold text-fg-dim ${dockerContexts.length > 0 ? 'mt-1' : ''}`}
                >
                  Kubernetes
                </div>
                {contexts.map((ctx) => {
                  const isSelected = !isDockerMode && selectedContext === ctx;

                  return (
                    <div
                      key={ctx}
                      onClick={() => handleSelect(ctx, false)}
                      className={`mx-1 px-2.5 py-1.5 rounded-md cursor-pointer text-sm flex items-center justify-between hover:bg-bg-hover ${
                        isSelected ? 'text-fg' : 'text-fg-muted'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Server size={14} className="opacity-50 shrink-0" />
                        <span className="truncate" title={ctx}>
                          {ctx}
                        </span>
                      </div>
                      {isSelected && <Check size={14} className="text-fg-muted shrink-0" />}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
