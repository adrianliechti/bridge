import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

// Check if value is an object that can be expanded
function isExpandable(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Check if value is a complex array that needs tree rendering
function isExpandableArray(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.length > 0 && value.some(v => typeof v === 'object' && v !== null);
}

// Format a value for display with syntax coloring
export function ValueDisplay({ value }: { value: unknown }) {
  if (value === null) {
    return <span className="text-neutral-500 italic">null</span>;
  }
  if (value === undefined) {
    return <span className="text-neutral-500 italic">undefined</span>;
  }
  if (typeof value === 'boolean') {
    return <span className={value ? 'text-emerald-400' : 'text-red-400'}>{String(value)}</span>;
  }
  if (typeof value === 'number') {
    return <span className="text-amber-400">{value}</span>;
  }
  if (typeof value === 'string') {
    // Check if it looks like a date
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
      return <span className="text-purple-400">{value}</span>;
    }
    // Check if it's a URL or path
    if (value.startsWith('http') || value.startsWith('/')) {
      return <span className="text-cyan-400">{value}</span>;
    }
    return <span className="text-emerald-300">"{value}"</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="text-neutral-500">[]</span>;
    }
    // For simple arrays of primitives, show inline
    if (value.every(v => typeof v !== 'object' || v === null)) {
      return (
        <span className="text-neutral-300">
          [
          {value.map((v, i) => (
            <span key={i}>
              {i > 0 && <span className="text-neutral-500">, </span>}
              <ValueDisplay value={v} />
            </span>
          ))}
          ]
        </span>
      );
    }
    // Complex arrays will be handled by ArrayTree
    return null;
  }
  // Fallback for other types
  return <span className="text-neutral-300">{JSON.stringify(value)}</span>;
}

// Render array items
export function ArrayTree({ data, depth = 0 }: { data: unknown[]; depth?: number }) {
  const [expanded, setExpanded] = useState<Set<number>>(() => {
    // Auto-expand first few items
    return new Set(data.slice(0, 3).map((_, i) => i));
  });

  const toggle = (index: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  return (
    <div className={depth > 0 ? 'ml-2 border-l border-neutral-800 pl-2' : ''}>
      {data.map((value, index) => {
        const isObj = isExpandable(value);
        const isArr = isExpandableArray(value);
        const isOpen = expanded.has(index);

        return (
          <div key={index} className="py-1">
            <div className="flex items-start gap-1">
              {(isObj || isArr) ? (
                <button
                  onClick={() => toggle(index)}
                  className="mt-0.5 text-neutral-500 hover:text-neutral-300 transition-colors"
                >
                  {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
              ) : (
                <span className="w-3.5" />
              )}
              <span className="text-neutral-500 text-sm">[{index}]</span>
              {!isObj && !isArr && (
                <span className="text-neutral-300 text-sm ml-1 break-all">
                  <ValueDisplay value={value} />
                </span>
              )}
            </div>
            {isObj && isOpen && (
              <ObjectTree data={value as Record<string, unknown>} depth={depth + 1} />
            )}
            {isArr && isOpen && (
              <ArrayTree data={value as unknown[]} depth={depth + 1} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// Recursive component to render nested objects
export function ObjectTree({ data, depth = 0 }: { data: Record<string, unknown>; depth?: number }) {
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    // Auto-expand first level
    if (depth === 0) {
      return new Set(Object.keys(data));
    }
    return new Set();
  });

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Sort keys alphabetically
  const sortedEntries = Object.entries(data).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className={depth > 0 ? 'ml-2 border-l border-neutral-800 pl-2' : ''}>
      {sortedEntries.map(([key, value]) => {
        const isObj = isExpandable(value);
        const isArr = isExpandableArray(value);
        const isOpen = expanded.has(key);

        return (
          <div key={key} className="py-1">
            <div className="flex items-start gap-1">
              {(isObj || isArr) ? (
                <button
                  onClick={() => toggle(key)}
                  className="mt-0.5 text-neutral-500 hover:text-neutral-300 transition-colors"
                >
                  {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
              ) : (
                <span className="w-3.5" />
              )}
              <span className="text-sky-400 text-sm">{key}:</span>
              {!isObj && !isArr && (
                <span className="text-sm ml-1 break-all">
                  <ValueDisplay value={value} />
                </span>
              )}
            </div>
            {isObj && isOpen && (
              <ObjectTree data={value as Record<string, unknown>} depth={depth + 1} />
            )}
            {isArr && isOpen && (
              <ArrayTree data={value as unknown[]} depth={depth + 1} />
            )}
          </div>
        );
      })}
    </div>
  );
}
