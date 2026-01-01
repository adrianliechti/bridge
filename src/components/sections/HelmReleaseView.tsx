// HelmReleaseView - Display decoded Helm release data from helm.sh/release.v1 secrets

import { useState, useEffect } from 'react';
import { Key, FileText, ChevronDown, ChevronRight, Copy, Check } from 'lucide-react';

// Helm release data structure
interface HelmRelease {
  name?: string;
  info?: {
    first_deployed?: string;
    last_deployed?: string;
    deleted?: string;
    description?: string;
    status?: string;
    notes?: string;
  };
  chart?: {
    metadata?: {
      name?: string;
      version?: string;
      appVersion?: string;
      description?: string;
      home?: string;
      icon?: string;
      keywords?: string[];
      maintainers?: { name?: string; email?: string; url?: string }[];
    };
  };
  config?: Record<string, unknown>;
  manifest?: string;
  version?: number;
  namespace?: string;
}

// Decode Helm release data
// Kubernetes stores: base64(helm_data)
// Helm stores: base64(gzip(JSON))
// So full chain is: base64 -> base64 -> gzip -> JSON
async function decodeHelmRelease(encoded: string): Promise<HelmRelease | null> {
  try {
    // First base64 decode (Kubernetes layer)
    const k8sDecoded = atob(encoded);
    
    // Second base64 decode (Helm layer)
    const helmDecoded = atob(k8sDecoded);
    
    // Convert to Uint8Array for decompression
    const bytes = new Uint8Array(helmDecoded.length);
    for (let i = 0; i < helmDecoded.length; i++) {
      bytes[i] = helmDecoded.charCodeAt(i);
    }
    
    // Decompress using DecompressionStream (gzip)
    const ds = new DecompressionStream('gzip');
    const writer = ds.writable.getWriter();
    writer.write(bytes);
    writer.close();
    
    const reader = ds.readable.getReader();
    const chunks: Uint8Array[] = [];
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    
    // Combine chunks
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const decompressed = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      decompressed.set(chunk, offset);
      offset += chunk.length;
    }
    
    // Convert to JSON string
    const jsonString = new TextDecoder().decode(decompressed);
    
    // Parse JSON
    return JSON.parse(jsonString);
  } catch (e) {
    console.error('Failed to decode Helm release:', e);
    return null;
  }
}

// Format Helm status with color
function getHelmStatusColor(status?: string): string {
  switch (status?.toLowerCase()) {
    case 'deployed':
      return 'text-emerald-400';
    case 'failed':
      return 'text-red-400';
    case 'pending-install':
    case 'pending-upgrade':
    case 'pending-rollback':
      return 'text-yellow-400';
    case 'uninstalling':
    case 'superseded':
      return 'text-neutral-400';
    default:
      return 'text-neutral-300';
  }
}

interface HelmReleaseViewProps {
  encoded: string;
}

export function HelmReleaseView({ encoded }: HelmReleaseViewProps) {
  const [release, setRelease] = useState<HelmRelease | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showValues, setShowValues] = useState(false);
  const [showManifest, setShowManifest] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const toggleValues = () => setShowValues(prev => !prev);
  const toggleManifest = () => setShowManifest(prev => !prev);
  const toggleNotes = () => setShowNotes(prev => !prev);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    decodeHelmRelease(encoded)
      .then(data => {
        setRelease(data);
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to decode Helm release data');
        setLoading(false);
      });
  }, [encoded]);

  const handleCopy = async (field: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  if (loading) {
    return (
      <div className="bg-neutral-100 dark:bg-neutral-800/50 rounded-lg p-4">
        <span className="text-xs text-neutral-500 dark:text-neutral-400">Decoding Helm release...</span>
      </div>
    );
  }

  if (error || !release) {
    return (
      <div className="bg-neutral-100 dark:bg-neutral-800/50 rounded-lg p-4">
        <span className="text-xs text-red-600 dark:text-red-400">{error || 'Failed to decode release'}</span>
      </div>
    );
  }

  const chart = release.chart?.metadata;
  const info = release.info;

  return (
    <div className="space-y-4">
      {/* Chart Description */}
      {chart?.description && (
        <p className="text-xs text-neutral-600 dark:text-neutral-400">{chart.description}</p>
      )}

      {/* Release Info Table */}
      <div className="bg-neutral-100 dark:bg-neutral-800/50 rounded-lg p-4">
        <table className="w-full text-xs">
          <tbody>
            <tr className="border-b border-neutral-200 dark:border-neutral-700/50">
              <td className="py-1.5 pr-3 text-neutral-500 dark:text-neutral-500 whitespace-nowrap">Release</td>
              <td className="py-1.5 text-neutral-900 dark:text-neutral-300">{release.name || 'Unknown'}</td>
            </tr>
            <tr className="border-b border-neutral-200 dark:border-neutral-700/50">
              <td className="py-1.5 pr-3 text-neutral-500 dark:text-neutral-500 whitespace-nowrap">Revision</td>
              <td className="py-1.5 text-neutral-900 dark:text-neutral-300">{release.version || 1}</td>
            </tr>
            <tr className="border-b border-neutral-200 dark:border-neutral-700/50">
              <td className="py-1.5 pr-3 text-neutral-500 dark:text-neutral-500 whitespace-nowrap">Status</td>
              <td className={`py-1.5 font-medium ${getHelmStatusColor(info?.status)}`}>
                {info?.status || 'Unknown'}
              </td>
            </tr>
            {chart && (
              <tr className="border-b border-neutral-200 dark:border-neutral-700/50">
                <td className="py-1.5 pr-3 text-neutral-500 dark:text-neutral-500 whitespace-nowrap">Chart</td>
                <td className="py-1.5 text-neutral-900 dark:text-neutral-300">{chart.name}-{chart.version}</td>
              </tr>
            )}
            {chart?.appVersion && (
              <tr className="border-b border-neutral-200 dark:border-neutral-700/50">
                <td className="py-1.5 pr-3 text-neutral-500 dark:text-neutral-500 whitespace-nowrap">App Version</td>
                <td className="py-1.5 text-cyan-600 dark:text-cyan-400">{chart.appVersion}</td>
              </tr>
            )}
            {info?.last_deployed && (
              <tr className="border-b border-neutral-200 dark:border-neutral-700/50 last:border-0">
                <td className="py-1.5 pr-3 text-neutral-500 dark:text-neutral-500 whitespace-nowrap">Last Deployed</td>
                <td className="py-1.5 text-neutral-900 dark:text-neutral-300">{new Date(info.last_deployed).toLocaleString()}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Values (collapsible) */}
      {release.config && Object.keys(release.config).length > 0 && (
        <div className="bg-neutral-100 dark:bg-neutral-800/50 rounded-lg overflow-hidden">
          <button
            onClick={toggleValues}
            className="w-full flex items-center justify-between p-3 hover:bg-neutral-200/50 dark:hover:bg-neutral-700/50 transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <Key size={14} className="text-amber-500 dark:text-amber-400" />
              <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">User Values</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopy('values', JSON.stringify(release.config, null, 2));
                }}
                className="p-1 rounded hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors"
                title="Copy values"
              >
                {copiedField === 'values' ? (
                  <Check size={14} className="text-emerald-500" />
                ) : (
                  <Copy size={14} className="text-neutral-400" />
                )}
              </button>
              {showValues ? (
                <ChevronDown size={14} className="text-neutral-400" />
              ) : (
                <ChevronRight size={14} className="text-neutral-400" />
              )}
            </div>
          </button>
          {showValues && (
            <div className="border-t border-neutral-200 dark:border-neutral-700 p-3">
              <pre className="text-xs text-neutral-600 dark:text-neutral-400 font-mono whitespace-pre-wrap break-all max-h-64 overflow-y-auto">
                {JSON.stringify(release.config, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Notes (collapsible) */}
      {info?.notes && (
        <div className="bg-neutral-100 dark:bg-neutral-800/50 rounded-lg overflow-hidden">
          <button
            onClick={toggleNotes}
            className="w-full flex items-center justify-between p-3 hover:bg-neutral-200/50 dark:hover:bg-neutral-700/50 transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <FileText size={14} className="text-blue-500 dark:text-blue-400" />
              <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Release Notes</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopy('notes', info.notes || '');
                }}
                className="p-1 rounded hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors"
                title="Copy notes"
              >
                {copiedField === 'notes' ? (
                  <Check size={14} className="text-emerald-500" />
                ) : (
                  <Copy size={14} className="text-neutral-400" />
                )}
              </button>
              {showNotes ? (
                <ChevronDown size={14} className="text-neutral-400" />
              ) : (
                <ChevronRight size={14} className="text-neutral-400" />
              )}
            </div>
          </button>
          {showNotes && (
            <div className="border-t border-neutral-200 dark:border-neutral-700 p-3">
              <pre className="text-xs text-neutral-600 dark:text-neutral-400 font-mono whitespace-pre-wrap break-all max-h-64 overflow-y-auto">
                {info.notes}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Manifest (collapsible) */}
      {release.manifest && (
        <div className="bg-neutral-100 dark:bg-neutral-800/50 rounded-lg overflow-hidden">
          <button
            onClick={toggleManifest}
            className="w-full flex items-center justify-between p-3 hover:bg-neutral-200/50 dark:hover:bg-neutral-700/50 transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <FileText size={14} className="text-purple-500 dark:text-purple-400" />
              <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Rendered Manifest</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopy('manifest', release.manifest || '');
                }}
                className="p-1 rounded hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors"
                title="Copy manifest"
              >
                {copiedField === 'manifest' ? (
                  <Check size={14} className="text-emerald-500" />
                ) : (
                  <Copy size={14} className="text-neutral-400" />
                )}
              </button>
              {showManifest ? (
                <ChevronDown size={14} className="text-neutral-400" />
              ) : (
                <ChevronRight size={14} className="text-neutral-400" />
              )}
            </div>
          </button>
          {showManifest && (
            <div className="border-t border-neutral-200 dark:border-neutral-700 p-3">
              <pre className="text-xs text-neutral-600 dark:text-neutral-400 font-mono whitespace-pre-wrap break-all max-h-96 overflow-y-auto">
                {release.manifest}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
