import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Server } from 'lucide-react';
import type { Context } from '../config';

interface ContextSelectorProps {
  contexts: Context[];
  selectedContext: string;
  onSelectContext: (context: string) => void;
}

export function ContextSelector({
  contexts,
  selectedContext,
  onSelectContext,
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

  const handleSelect = (contextName: string) => {
    onSelectContext(contextName);
    setIsOpen(false);
  };

  // Single context - don't show anything
  if (contexts.length <= 1) {
    return null;
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 w-full px-1 py-0.5 text-xs text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors rounded group"
      >
        <Server size={12} className="opacity-60 group-hover:opacity-80" />
        <span className="truncate flex-1 text-left">{selectedContext}</span>
        <ChevronDown 
          size={12} 
          className={`opacity-40 group-hover:opacity-60 transition-transform ${isOpen ? 'rotate-180' : ''}`} 
        />
      </button>

      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white dark:bg-neutral-950 rounded-lg shadow-xl max-h-64 overflow-y-auto border border-neutral-200 dark:border-neutral-700">
          <div className="py-1">
            <div className="px-3 py-1 text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
              Clusters
            </div>
            {contexts.map((ctx) => {
              const isSelected = selectedContext === ctx.name;
              
              return (
                <div
                  key={ctx.name}
                  onClick={() => handleSelect(ctx.name)}
                  className={`mx-1 px-2.5 py-1.5 rounded-md cursor-pointer text-sm flex items-center justify-between hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
                    isSelected
                      ? 'text-neutral-900 dark:text-neutral-100'
                      : 'text-neutral-600 dark:text-neutral-400'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <Server size={14} className="opacity-50 shrink-0" />
                    <span className="truncate">{ctx.name}</span>
                  </div>
                  {isSelected && (
                    <Check size={14} className="text-neutral-500 dark:text-neutral-400 shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
