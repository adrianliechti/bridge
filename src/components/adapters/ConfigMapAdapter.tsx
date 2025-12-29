// ConfigMap Adapter (v1)
// Extracts display data from Kubernetes ConfigMap resources
/* eslint-disable react-refresh/only-export-components */
import { FileText, Copy, Check, ChevronDown, ChevronRight, Lock } from 'lucide-react';
import { useState } from 'react';
import type { ResourceAdapter, ResourceSections, Section } from './types';
import type { V1ConfigMap } from '@kubernetes/client-node';

// Check if content is multiline
function isMultiline(content: string): boolean {
  return content.includes('\n');
}

// Component for displaying a multiline config value (collapsible)
function MultilineConfigValue({ name, value }: { name: string; value: string }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-neutral-100 dark:bg-neutral-800/50 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-neutral-200/50 dark:hover:bg-neutral-700/50 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <FileText size={14} className="text-blue-500 dark:text-blue-400" />
          <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">{name}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleCopy();
            }}
            className="p-1 rounded hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors"
            title="Copy value"
          >
            {copied ? (
              <Check size={14} className="text-emerald-500" />
            ) : (
              <Copy size={14} className="text-neutral-400" />
            )}
          </button>
          {expanded ? (
            <ChevronDown size={14} className="text-neutral-400" />
          ) : (
            <ChevronRight size={14} className="text-neutral-400" />
          )}
        </div>
      </button>
      {expanded && (
        <div className="border-t border-neutral-200 dark:border-neutral-700 p-3">
          <pre className="text-xs text-neutral-700 dark:text-neutral-400 font-mono whitespace-pre-wrap break-all max-h-64 overflow-y-auto">
            {value}
          </pre>
        </div>
      )}
    </div>
  );
}

// Component for displaying single-line values as a table
function SingleLineTable({ entries }: { entries: [string, string][] }) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = async (key: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="bg-neutral-100 dark:bg-neutral-800/50 rounded-lg p-4">
      <table className="w-full text-xs">
        <tbody>
          {entries.map(([key, value]) => (
            <tr key={key} className="border-b border-neutral-200 dark:border-neutral-700/50 last:border-0">
              <td className="py-1.5 pr-3 text-neutral-500 whitespace-nowrap">
                {key}
              </td>
              <td className="py-1.5 font-mono break-all text-neutral-900 dark:text-neutral-300">
                {value}
              </td>
              <td className="py-1.5 w-1">
                <button
                  onClick={() => handleCopy(key, value)}
                  className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                  title="Copy value"
                >
                  {copiedKey === key ? (
                    <Check size={12} className="text-emerald-500" />
                  ) : (
                    <Copy size={12} className="text-neutral-400" />
                  )}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Component for binary data
function BinaryValue({ name, value }: { name: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-neutral-100 dark:bg-neutral-800/50 rounded-lg p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText size={14} className="text-purple-500 dark:text-purple-400" />
          <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">{name}</span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400">
            Binary
          </span>
        </div>
        <button
          onClick={handleCopy}
          className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
          title="Copy base64 value"
        >
          {copied ? (
            <Check size={12} className="text-emerald-500" />
          ) : (
            <Copy size={12} className="text-neutral-400" />
          )}
        </button>
      </div>
    </div>
  );
}

export const ConfigMapAdapter: ResourceAdapter<V1ConfigMap> = {
  kinds: ['ConfigMap', 'ConfigMaps'],

  adapt(_context: string, resource): ResourceSections {
    const data = resource.data || {};
    const binaryData = resource.binaryData || {};

    const dataKeys = Object.keys(data);
    const binaryKeys = Object.keys(binaryData);
    const totalKeys = dataKeys.length + binaryKeys.length;

    const sections: Section[] = [
      // ConfigMap overview
      {
        id: 'status',
        data: {
          type: 'status-cards',
          items: [
            ...(resource.immutable ? [{
              label: 'Immutable',
              value: 'Yes',
              status: 'warning' as const,
              icon: <Lock size={14} className="text-amber-400" />,
            }] : []),
          ],
        },
      },
    ];

    // Separate single-line and multiline entries
    const singleLineEntries: [string, string][] = [];
    const multilineEntries: [string, string][] = [];
    
    dataKeys.forEach(key => {
      if (isMultiline(data[key])) {
        multilineEntries.push([key, data[key]]);
      } else {
        singleLineEntries.push([key, data[key]]);
      }
    });

    // Single-line data entries (as table)
    if (singleLineEntries.length > 0) {
      sections.push({
        id: 'data-simple',
        title: 'Data',
        data: {
          type: 'custom',
          render: () => <SingleLineTable entries={singleLineEntries} />,
        },
      });
    }

    // Multiline data entries (collapsible)
    if (multilineEntries.length > 0) {
      sections.push({
        id: 'data-multiline',
        title: singleLineEntries.length > 0 ? 'Files' : 'Data',
        data: {
          type: 'custom',
          render: () => (
            <div className="space-y-2">
              {multilineEntries.map(([key, value]) => (
                <MultilineConfigValue key={key} name={key} value={value} />
              ))}
            </div>
          ),
        },
      });
    }

    // Binary data entries
    if (binaryKeys.length > 0) {
      sections.push({
        id: 'binary-data',
        title: 'Binary Data',
        data: {
          type: 'custom',
          render: () => (
            <div className="space-y-2">
              {binaryKeys.map(key => (
                <BinaryValue key={key} name={key} value={binaryData[key]} />
              ))}
            </div>
          ),
        },
      });
    }

    // Empty state
    if (totalKeys === 0) {
      sections.push({
        id: 'empty',
        data: {
          type: 'custom',
          render: () => (
            <div className="text-center py-8 text-neutral-400 dark:text-neutral-500">
              <FileText size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">This ConfigMap is empty</p>
            </div>
          ),
        },
      });
    }

    return { sections };
  },
};
