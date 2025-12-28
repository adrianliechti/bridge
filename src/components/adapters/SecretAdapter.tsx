// Secret Adapter (v1)
// Extracts display data from Kubernetes Secret resources

/* eslint-disable react-refresh/only-export-components */

import { Key, Lock, Eye, EyeOff, Copy, Check, FileText, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import type { ResourceAdapter, ResourceSections, Section } from './types';
import type { V1Secret } from '@kubernetes/client-node';
import { HelmReleaseView } from '../sections/HelmReleaseView';
import { DockerConfigView } from '../sections/DockerConfigView';
import { CertificateView, PrivateKeyView, CsrView, PublicKeyView, detectPemType } from '../sections/CertificateView';

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
  const trimmed = content.replace(/^[\r\n]+|[\r\n]+$/g, '');
  return trimmed.includes('\n');
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
    <div className="bg-neutral-100 dark:bg-neutral-800/50 rounded-lg p-4">
      <table className="w-full text-xs">
        <tbody>
          {entries.map(({ key, decoded, isSensitive }) => (
            <tr key={key} className="border-b border-neutral-200 dark:border-neutral-700/50 last:border-0">
              <td className="py-1.5 pr-3 text-neutral-500 whitespace-nowrap">
                {key}
              </td>
              <td className="py-1.5 font-mono break-all">
                {isSensitive && !revealedKeys.has(key) ? (
                  <span className="text-neutral-400">••••••••••••••••</span>
                ) : (
                  <span className="text-neutral-900 dark:text-neutral-300">{decoded}</span>
                )}
              </td>
              <td className="py-1.5 w-1">
                <div className="flex items-center gap-1">
                  {isSensitive ? (
                    <button
                      onClick={() => toggleReveal(key)}
                      className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                      title={revealedKeys.has(key) ? 'Hide value' : 'Reveal value'}
                    >
                      {revealedKeys.has(key) ? (
                        <EyeOff size={12} className="text-neutral-400" />
                      ) : (
                        <Eye size={12} className="text-neutral-400" />
                      )}
                    </button>
                  ) : (
                    <div className="w-7" />
                  )}
                  <button
                    onClick={() => handleCopy(key, decoded)}
                    className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                    title="Copy value"
                  >
                    {copiedKey === key ? (
                      <Check size={12} className="text-emerald-500" />
                    ) : (
                      <Copy size={12} className="text-neutral-400" />
                    )}
                  </button>
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
    <div className="bg-neutral-100 dark:bg-neutral-800/50 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-neutral-200/50 dark:hover:bg-neutral-700/50 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <Key size={14} className="text-amber-500 dark:text-amber-400" />
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
          {isSensitive && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setRevealed(!revealed);
              }}
              className="p-1 rounded hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors"
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
        <div className="border-t border-neutral-200 dark:border-neutral-700 p-3">
          {isSensitive && !revealed ? (
            <span className="text-xs text-neutral-400 font-mono">••••••••••••••••</span>
          ) : (
            <pre className="text-xs text-neutral-600 dark:text-neutral-400 font-mono whitespace-pre-wrap break-all max-h-64 overflow-y-auto">
              {decoded}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export const SecretAdapter: ResourceAdapter<V1Secret> = {
  kinds: ['Secret', 'Secrets'],

  adapt(_context: string, resource): ResourceSections {
    const data = resource.data || {};
    const stringData = resource.stringData || {};

    const keys = [...new Set([...Object.keys(data), ...Object.keys(stringData)])];

    // Special handling for Helm release secrets
    if (resource.type === 'helm.sh/release.v1' && data.release) {
      return {
        sections: [{
          id: 'helm-release',
          data: {
            type: 'custom',
            render: () => <HelmReleaseView encoded={data.release} />,
          },
        }],
      };
    }

    // Special handling for Docker config secrets
    if (resource.type === 'kubernetes.io/dockerconfigjson' && data['.dockerconfigjson']) {
      return {
        sections: [{
          id: 'docker-config',
          data: {
            type: 'custom',
            render: () => <DockerConfigView encoded={data['.dockerconfigjson']} />,
          },
        }],
      };
    }

    const sections: Section[] = [];

    // Only show status if immutable
    if (resource.immutable) {
      sections.push({
        id: 'status',
        data: {
          type: 'status-cards',
          items: [{
            label: 'Immutable',
            value: 'Yes',
            status: 'warning' as const,
            icon: <Lock size={14} className="text-amber-400" />,
          }],
        },
      });
    }

    // Separate entries by type
    const singleLineEntries: { key: string; decoded: string; isSensitive: boolean }[] = [];
    const multilineEntries: { key: string; decoded: string; isSensitive: boolean }[] = [];
    const binaryEntries: string[] = [];
    const certificateEntries: { key: string; pem: string }[] = [];
    const privateKeyEntries: { key: string; pem: string }[] = [];
    const publicKeyEntries: string[] = [];
    const csrEntries: { key: string; pem: string }[] = [];

    keys.forEach(key => {
      const rawValue = data[key] || btoa(stringData[key] || '');
      const decoded = decodeBase64(rawValue);
      const isSensitive = isSensitiveKey(key);

      if (!decoded) {
        binaryEntries.push(key);
      } else if (isBinaryContent(decoded)) {
        binaryEntries.push(key);
      } else {
        // Check for PEM content
        const pemResult = detectPemType(decoded);
        if (pemResult) {
          switch (pemResult.type) {
            case 'certificate':
              certificateEntries.push({ key, pem: pemResult.content });
              break;
            case 'private-key':
              privateKeyEntries.push({ key, pem: pemResult.content });
              break;
            case 'public-key':
              publicKeyEntries.push(key);
              break;
            case 'csr':
              csrEntries.push({ key, pem: pemResult.content });
              break;
            default:
              if (isMultiline(decoded)) {
                multilineEntries.push({ key, decoded, isSensitive });
              } else {
                singleLineEntries.push({ key, decoded, isSensitive });
              }
          }
        } else if (isMultiline(decoded)) {
          multilineEntries.push({ key, decoded, isSensitive });
        } else {
          singleLineEntries.push({ key, decoded, isSensitive });
        }
      }
    });

    // Certificate entries
    if (certificateEntries.length > 0) {
      sections.push({
        id: 'certificates',
        title: 'Certificates',
        data: {
          type: 'custom',
          render: () => (
            <div className="space-y-2">
              {certificateEntries.map(({ key, pem }) => (
                <CertificateView key={key} name={key} pem={pem} />
              ))}
            </div>
          ),
        },
      });
    }

    // Private key entries
    if (privateKeyEntries.length > 0) {
      sections.push({
        id: 'private-keys',
        title: 'Private Keys',
        data: {
          type: 'custom',
          render: () => (
            <div className="space-y-2">
              {privateKeyEntries.map(({ key, pem }) => (
                <PrivateKeyView key={key} name={key} pem={pem} />
              ))}
            </div>
          ),
        },
      });
    }

    // Public key entries
    if (publicKeyEntries.length > 0) {
      sections.push({
        id: 'public-keys',
        title: 'Public Keys',
        data: {
          type: 'custom',
          render: () => (
            <div className="space-y-2">
              {publicKeyEntries.map(key => (
                <PublicKeyView key={key} name={key} />
              ))}
            </div>
          ),
        },
      });
    }

    // CSR entries
    if (csrEntries.length > 0) {
      sections.push({
        id: 'csrs',
        title: 'Certificate Requests',
        data: {
          type: 'custom',
          render: () => (
            <div className="space-y-2">
              {csrEntries.map(({ key, pem }) => (
                <CsrView key={key} name={key} pem={pem} />
              ))}
            </div>
          ),
        },
      });
    }

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
                <div key={key} className="bg-neutral-100 dark:bg-neutral-800/50 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <FileText size={14} className="text-purple-500 dark:text-purple-400" />
                    <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">{key}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400">
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
