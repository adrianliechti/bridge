// Secret Adapter (v1)
// Extracts display data from Kubernetes Secret resources

import { Key, Lock, Eye, EyeOff, Copy, Check, FileText, Shield, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import type { ResourceAdapter, ResourceSections, Section, StatusLevel } from './types';

// Secret types
interface Secret {
  apiVersion?: string;
  kind?: string;
  metadata?: {
    name?: string;
    namespace?: string;
    uid?: string;
    creationTimestamp?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  type?: string;
  data?: Record<string, string>;
  stringData?: Record<string, string>;
  immutable?: boolean;
}

// Get secret type display info
function getSecretTypeInfo(type?: string): { label: string; status: StatusLevel } {
  switch (type) {
    case 'kubernetes.io/service-account-token':
      return { label: 'Service Account Token', status: 'neutral' };
    case 'kubernetes.io/dockercfg':
      return { label: 'Docker Config', status: 'neutral' };
    case 'kubernetes.io/dockerconfigjson':
      return { label: 'Docker Config JSON', status: 'neutral' };
    case 'kubernetes.io/basic-auth':
      return { label: 'Basic Auth', status: 'neutral' };
    case 'kubernetes.io/ssh-auth':
      return { label: 'SSH Auth', status: 'neutral' };
    case 'kubernetes.io/tls':
      return { label: 'TLS', status: 'success' };
    case 'bootstrap.kubernetes.io/token':
      return { label: 'Bootstrap Token', status: 'warning' };
    case 'Opaque':
    default:
      return { label: type || 'Opaque', status: 'neutral' };
  }
}

// Decode base64 safely
function decodeBase64(encoded: string): string | null {
  try {
    return atob(encoded);
  } catch {
    return null;
  }
}

// Check if content is likely binary
function isBinaryContent(decoded: string): boolean {
  // Check for null bytes or high ratio of non-printable characters
  let nonPrintable = 0;
  for (let i = 0; i < Math.min(decoded.length, 1000); i++) {
    const code = decoded.charCodeAt(i);
    if (code === 0 || (code < 32 && code !== 9 && code !== 10 && code !== 13)) {
      nonPrintable++;
    }
  }
  return nonPrintable > decoded.length * 0.1;
}

// Check if content is multiline
function isMultiline(content: string): boolean {
  return content.includes('\n');
}

// Check if a key name indicates sensitive data
function isSensitiveKey(name: string): boolean {
  return !name.endsWith('.crt') && 
         !name.endsWith('.pem') && 
         name !== 'ca.crt' && 
         name !== 'tls.crt' &&
         name !== 'namespace';
}

// Component for displaying single-line secret values as a table
function SingleLineSecretTable({ entries }: { entries: { key: string; decoded: string; isSensitive: boolean }[] }) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());

  const handleCopy = async (key: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const toggleReveal = (key: string) => {
    setRevealedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  return (
    <div className="bg-neutral-900/50 border border-neutral-700 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <tbody>
          {entries.map(({ key, decoded, isSensitive }) => (
            <tr key={key} className="border-b border-neutral-700/50 last:border-b-0">
              <td className="px-3 py-2 text-neutral-400 font-medium whitespace-nowrap w-1">
                {key}
              </td>
              <td className="px-3 py-2 text-neutral-300 font-mono text-xs break-all">
                {isSensitive && !revealedKeys.has(key) ? (
                  <span className="text-neutral-500">••••••••••••••••</span>
                ) : (
                  decoded
                )}
              </td>
              <td className="px-2 py-2 w-1">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleCopy(key, decoded)}
                    className="p-1 rounded hover:bg-neutral-700 transition-colors"
                    title="Copy value"
                  >
                    {copiedKey === key ? (
                      <Check size={14} className="text-emerald-400" />
                    ) : (
                      <Copy size={14} className="text-neutral-500" />
                    )}
                  </button>
                  {isSensitive && (
                    <button
                      onClick={() => toggleReveal(key)}
                      className="p-1 rounded hover:bg-neutral-700 transition-colors"
                      title={revealedKeys.has(key) ? 'Hide value' : 'Reveal value'}
                    >
                      {revealedKeys.has(key) ? (
                        <EyeOff size={14} className="text-neutral-500" />
                      ) : (
                        <Eye size={14} className="text-neutral-500" />
                      )}
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Component for displaying a multiline secret value (collapsible)
function MultilineSecretValue({ name, decoded, isSensitive }: { name: string; decoded: string; isSensitive: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(decoded);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-neutral-900/50 border border-neutral-700 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-neutral-800/50 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <Key size={14} className="text-amber-400" />
          <span className="text-sm font-medium text-neutral-300">{name}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleCopy();
            }}
            className="p-1 rounded hover:bg-neutral-700 transition-colors"
            title="Copy value"
          >
            {copied ? (
              <Check size={14} className="text-emerald-400" />
            ) : (
              <Copy size={14} className="text-neutral-400" />
            )}
          </button>
          {isSensitive && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setRevealed(!revealed);
              }}
              className="p-1 rounded hover:bg-neutral-700 transition-colors"
              title={revealed ? 'Hide value' : 'Reveal value'}
            >
              {revealed ? (
                <EyeOff size={14} className="text-neutral-400" />
              ) : (
                <Eye size={14} className="text-neutral-400" />
              )}
            </button>
          )}
          {expanded ? (
            <ChevronDown size={14} className="text-neutral-400" />
          ) : (
            <ChevronRight size={14} className="text-neutral-400" />
          )}
        </div>
      </button>
      {expanded && (
        <div className="border-t border-neutral-700 p-3">
          {isSensitive && !revealed ? (
            <span className="text-xs text-neutral-500 font-mono">••••••••••••••••</span>
          ) : (
            <pre className="text-xs text-neutral-400 font-mono whitespace-pre-wrap break-all max-h-64 overflow-y-auto">
              {decoded}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export const SecretAdapter: ResourceAdapter<Secret> = {
  kinds: ['Secret', 'Secrets'],

  adapt(resource): ResourceSections {
    const metadata = resource.metadata;
    const data = resource.data || {};
    const stringData = resource.stringData || {};

    const typeInfo = getSecretTypeInfo(resource.type);
    const keys = [...new Set([...Object.keys(data), ...Object.keys(stringData)])];

    // Filter labels (remove internal ones)
    const labels = metadata?.labels ?? {};
    const filteredLabels = Object.fromEntries(
      Object.entries(labels).filter(([key]) => 
        !key.includes('pod-template-hash') && 
        !key.includes('controller-revision-hash')
      )
    );

    // Filter annotations (remove internal ones)
    const annotations = metadata?.annotations ?? {};
    const filteredAnnotations = Object.fromEntries(
      Object.entries(annotations).filter(([key]) => 
        !key.includes('kubectl.kubernetes.io/last-applied-configuration') &&
        key !== 'kubernetes.io/description'
      )
    );

    const sections: Section[] = [
      // Secret type and info
      {
        id: 'status',
        data: {
          type: 'status-cards',
          items: [
            {
              label: 'Type',
              value: typeInfo.label,
              status: typeInfo.status,
              icon: <Shield size={14} className="text-amber-400" />,
            },
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

    // Labels
    if (Object.keys(filteredLabels).length > 0) {
      sections.push({
        id: 'labels',
        data: {
          type: 'labels' as const,
          labels: filteredLabels,
          title: 'Labels',
        },
      });
    }

    // Annotations
    if (Object.keys(filteredAnnotations).length > 0) {
      sections.push({
        id: 'annotations',
        data: {
          type: 'labels' as const,
          labels: filteredAnnotations,
          title: 'Annotations',
        },
      });
    }

    // Separate entries by type
    const singleLineEntries: { key: string; decoded: string; isSensitive: boolean }[] = [];
    const multilineEntries: { key: string; decoded: string; isSensitive: boolean }[] = [];
    const binaryEntries: string[] = [];

    keys.forEach(key => {
      const rawValue = data[key] || btoa(stringData[key] || '');
      const decoded = decodeBase64(rawValue);
      const isSensitive = isSensitiveKey(key);

      if (!decoded) {
        binaryEntries.push(key);
      } else if (isBinaryContent(decoded)) {
        binaryEntries.push(key);
      } else if (isMultiline(decoded)) {
        multilineEntries.push({ key, decoded, isSensitive });
      } else {
        singleLineEntries.push({ key, decoded, isSensitive });
      }
    });

    // Single-line data entries (as table)
    if (singleLineEntries.length > 0) {
      sections.push({
        id: 'data-simple',
        title: 'Data',
        data: {
          type: 'custom',
          render: () => <SingleLineSecretTable entries={singleLineEntries} />,
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
              {multilineEntries.map(({ key, decoded, isSensitive }) => (
                <MultilineSecretValue key={key} name={key} decoded={decoded} isSensitive={isSensitive} />
              ))}
            </div>
          ),
        },
      });
    }

    // Binary data entries
    if (binaryEntries.length > 0) {
      sections.push({
        id: 'binary-data',
        title: 'Binary Data',
        data: {
          type: 'custom',
          render: () => (
            <div className="space-y-2">
              {binaryEntries.map(key => (
                <div key={key} className="bg-neutral-900/50 border border-neutral-700 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <FileText size={14} className="text-purple-400" />
                    <span className="text-sm font-medium text-neutral-300">{key}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
                      Binary
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ),
        },
      });
    }

    return { sections };
  },
};
