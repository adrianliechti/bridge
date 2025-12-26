import { useState } from 'react';
import { Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import type { KubernetesResource } from '../../api/kubernetes';
import { ValueDisplay, ObjectTree, ArrayTree } from './TreeViewer';

// Manifest view component with interactive collapsible tree
export function ManifestView({ 
  resource, 
  loading, 
  error,
  expandAll,
}: { 
  resource: KubernetesResource | null; 
  loading: boolean; 
  error: string | null;
  expandAll?: boolean | null;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400 text-sm">
          <Loader2 size={14} className="animate-spin" />
          Loading manifest...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
      </div>
    );
  }

  if (!resource) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-sm text-neutral-500 dark:text-neutral-400">No resource loaded</div>
      </div>
    );
  }

  // Define the order of top-level keys
  const keyOrder = ['apiVersion', 'kind', 'metadata', 'spec', 'status', 'data', 'stringData', 'type'];
  const resourceKeys = Object.keys(resource);
  const orderedKeys = [
    ...keyOrder.filter(k => resourceKeys.includes(k)),
    ...resourceKeys.filter(k => !keyOrder.includes(k))
  ];

  return (
    <>
      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        <div className="space-y-1">
          {orderedKeys.map(key => {
            const value = (resource as Record<string, unknown>)[key];
            const defaultOpenKeys = ['metadata', 'spec', 'status'];
            const shouldBeOpen = expandAll !== null && expandAll !== undefined 
              ? expandAll 
              : defaultOpenKeys.includes(key);
            return (
              <ManifestSection 
                key={key} 
                label={key} 
                value={value}
                defaultOpen={shouldBeOpen}
              />
            );
          })}
        </div>
      </div>
    </>
  );
}

// Collapsible section for manifest top-level keys
function ManifestSection({ 
  label, 
  value, 
  defaultOpen = false 
}: { 
  label: string; 
  value: unknown; 
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const isExpandable = value !== null && typeof value === 'object';

  if (!isExpandable) {
    // Simple key-value display for primitives
    return (
      <div className="flex items-center gap-2 py-1 px-3">
        <span className="w-4" />
        <span className="text-purple-400 font-medium text-sm">{label}:</span>
        <span className="text-sm"><ValueDisplay value={value} /></span>
      </div>
    );
  }

  const isEmpty = Array.isArray(value) ? value.length === 0 : Object.keys(value as object).length === 0;

  return (
    <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-neutral-100 dark:bg-neutral-800/50 hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors text-left"
      >
        {isOpen ? (
          <ChevronDown size={14} className="text-neutral-500 shrink-0" />
        ) : (
          <ChevronRight size={14} className="text-neutral-500 shrink-0" />
        )}
        <span className="text-purple-400 font-medium text-sm">{label}</span>
        {isEmpty && (
          <span className="text-neutral-500 text-xs">(empty)</span>
        )}
        {!isEmpty && !isOpen && (
          <span className="text-neutral-500 text-xs">
            {Array.isArray(value) ? `[${value.length} items]` : `{${Object.keys(value as object).length} fields}`}
          </span>
        )}
      </button>
      {isOpen && !isEmpty && (
        <div className="px-3 py-2 bg-neutral-50 dark:bg-neutral-900/30">
          {Array.isArray(value) ? (
            <ArrayTree data={value} depth={0} />
          ) : (
            <ObjectTree data={value as Record<string, unknown>} depth={0} />
          )}
        </div>
      )}
    </div>
  );
}
