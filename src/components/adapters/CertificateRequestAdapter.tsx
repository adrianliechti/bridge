// CertificateRequest Adapter (cert-manager.io/v1)
// Extracts display data from cert-manager CertificateRequest resources

/* eslint-disable react-refresh/only-export-components */

import { FileCheck, Key, User, Clock, CheckCircle2, AlertCircle, RefreshCw, XCircle, Link, Copy, Check, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import type { ResourceAdapter, ResourceSections, StatusLevel, Section } from './types';


// cert-manager CertificateRequest types
interface IssuerRef {
  name: string;
  kind: string;
  group?: string;
}

interface CertificateRequestCondition {
  type: string;
  status: string;
  lastTransitionTime?: string;
  reason?: string;
  message?: string;
}

interface OwnerReference {
  apiVersion: string;
  kind: string;
  name: string;
  uid: string;
  controller?: boolean;
  blockOwnerDeletion?: boolean;
}

interface CertificateRequestSpec {
  request: string; // Base64 encoded CSR
  issuerRef: IssuerRef;
  duration?: string;
  isCA?: boolean;
  usages?: string[];
  username?: string;
  uid?: string;
  groups?: string[];
  extra?: Record<string, string[]>;
}

interface CertificateRequestStatus {
  conditions?: CertificateRequestCondition[];
  certificate?: string; // Base64 encoded certificate
  ca?: string; // Base64 encoded CA certificate
  failureTime?: string;
}

interface CertificateRequest {
  apiVersion?: string;
  kind?: string;
  metadata?: {
    name?: string;
    namespace?: string;
    uid?: string;
    creationTimestamp?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
    ownerReferences?: OwnerReference[];
  };
  spec?: CertificateRequestSpec;
  status?: CertificateRequestStatus;
}

// Helper functions
function getRequestState(conditions?: CertificateRequestCondition[]): {
  approved: boolean;
  denied: boolean;
  ready: boolean;
  failed: boolean;
  reason?: string;
  message?: string;
} {
  const approvedCondition = conditions?.find(c => c.type === 'Approved');
  const deniedCondition = conditions?.find(c => c.type === 'Denied');
  const readyCondition = conditions?.find(c => c.type === 'Ready');
  const invalidRequestCondition = conditions?.find(c => c.type === 'InvalidRequest');

  const approved = approvedCondition?.status === 'True';
  const denied = deniedCondition?.status === 'True';
  const ready = readyCondition?.status === 'True';
  const failed = readyCondition?.status === 'False' || invalidRequestCondition?.status === 'True';

  // Determine the most relevant reason/message
  let reason: string | undefined;
  let message: string | undefined;

  if (ready) {
    reason = readyCondition?.reason;
    message = readyCondition?.message;
  } else if (failed) {
    reason = readyCondition?.reason || invalidRequestCondition?.reason;
    message = readyCondition?.message || invalidRequestCondition?.message;
  } else if (denied) {
    reason = deniedCondition?.reason;
    message = deniedCondition?.message;
  } else if (approved) {
    reason = approvedCondition?.reason;
    message = approvedCondition?.message;
  }

  return { approved, denied, ready, failed, reason, message };
}

function getOverallStatus(state: ReturnType<typeof getRequestState>): {
  text: string;
  level: StatusLevel;
} {
  if (state.ready) {
    return { text: 'Issued', level: 'success' };
  }
  if (state.failed || state.denied) {
    return { text: state.denied ? 'Denied' : 'Failed', level: 'error' };
  }
  if (state.approved) {
    return { text: 'Approved', level: 'warning' };
  }
  return { text: 'Pending', level: 'warning' };
}

function getStatusIcon(state: ReturnType<typeof getRequestState>) {
  if (state.ready) {
    return <CheckCircle2 size={14} className="text-emerald-400" />;
  }
  if (state.failed || state.denied) {
    return <XCircle size={14} className="text-red-400" />;
  }
  if (state.approved) {
    return <RefreshCw size={14} className="text-amber-400 animate-spin" />;
  }
  return <AlertCircle size={14} className="text-amber-400" />;
}

function formatDuration(duration?: string): string {
  if (!duration) return 'Default (90d)';
  // Parse Go duration format (e.g., "87600h0m0s" -> "10y")
  const match = duration.match(/^(\d+)h/);
  if (match) {
    const hours = parseInt(match[1], 10);
    if (hours >= 8760) {
      const years = Math.round(hours / 8760);
      return `${years}y`;
    }
    if (hours >= 720) {
      const months = Math.round(hours / 720);
      return `${months}mo`;
    }
    if (hours >= 24) {
      const days = Math.round(hours / 24);
      return `${days}d`;
    }
    return `${hours}h`;
  }
  return duration;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return 'N/A';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function decodeBase64(encoded?: string): string | null {
  if (!encoded) return null;
  try {
    return atob(encoded);
  } catch {
    return null;
  }
}

// Collapsible PEM data component with copy functionality
function PemDataBlock({ title, data, icon }: { title: string; data: string; icon: React.ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(data);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-neutral-100 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
            title="Copy to clipboard"
          >
            {copied ? (
              <Check size={14} className="text-emerald-400" />
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
          <pre className="text-xs text-neutral-400 font-mono whitespace-pre-wrap break-all overflow-x-auto max-h-64 overflow-y-auto">
            {data}
          </pre>
        </div>
      )}
    </div>
  );
}

export const CertificateRequestAdapter: ResourceAdapter<CertificateRequest> = {
  kinds: ['CertificateRequest', 'CertificateRequests'],

  adapt(resource): ResourceSections {
    const spec = resource.spec;
    const status = resource.status;
    const metadata = resource.metadata;

    if (!spec) {
      return { sections: [] };
    }

    const state = getRequestState(status?.conditions);
    const overallStatus = getOverallStatus(state);
    const certificateName = metadata?.annotations?.['cert-manager.io/certificate-name'];
    const revision = metadata?.annotations?.['cert-manager.io/certificate-revision'];

    const sections: Section[] = [
      // Status overview
      {
        id: 'status',
        data: {
          type: 'status-cards',
          items: [
            {
              label: 'Status',
              value: overallStatus.text,
              status: overallStatus.level,
              icon: getStatusIcon(state),
            },
            ...(state.approved ? [{
              label: 'Approved',
              value: 'Yes',
              status: 'success' as const,
              icon: <CheckCircle2 size={14} className="text-emerald-400" />,
            }] : []),
            ...(spec.isCA ? [{
              label: 'Type',
              value: 'CA Certificate',
              status: 'neutral' as const,
              icon: <FileCheck size={14} className="text-purple-400" />,
            }] : [{
              label: 'Type',
              value: 'TLS Certificate',
              status: 'neutral' as const,
              icon: <FileCheck size={14} className="text-blue-400" />,
            }]),
            ...(revision ? [{
              label: 'Revision',
              value: revision,
              status: 'neutral' as const,
            }] : []),
          ],
        },
      },
    ];

    // Parent Certificate (if owned by a Certificate)
    if (certificateName) {
      sections.push({
        id: 'parent-certificate',
        title: 'Parent Certificate',
        data: {
          type: 'custom',
          render: () => (
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <Link size={14} className="text-blue-400" />
                <span className="text-sm text-blue-300">{certificateName}</span>
              </div>
            </div>
          ),
        },
      });
    }

    // Request Details
    sections.push({
      id: 'details',
      title: 'Request Details',
      data: {
        type: 'info-grid',
        columns: 2,
        items: [
          { label: 'Duration', value: formatDuration(spec.duration) },
          ...(metadata?.creationTimestamp ? [{ label: 'Created', value: formatDate(metadata.creationTimestamp) }] : []),
          ...(spec.username ? [{ label: 'Requested By', value: spec.username.split(':').pop() || spec.username }] : []),
        ],
      },
    });

    // Issuer Reference
    sections.push({
      id: 'issuer',
      title: 'Issuer',
      data: {
        type: 'custom',
        render: () => (
          <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <Key size={14} className="text-purple-400" />
              <span className="text-sm font-medium text-purple-300">
                {spec.issuerRef.kind ?? 'Issuer'}
              </span>
            </div>
            <div className="text-sm text-neutral-700 dark:text-neutral-300">{spec.issuerRef.name}</div>
            {spec.issuerRef.group && (
              <div className="text-xs text-neutral-500 mt-1">{spec.issuerRef.group}</div>
            )}
          </div>
        ),
      },
    });

    // Requester info
    if (spec.username || spec.groups?.length) {
      sections.push({
        id: 'requester',
        title: 'Requester',
        data: {
          type: 'custom',
          render: () => (
            <div className="bg-neutral-100 dark:bg-neutral-900/50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <User size={14} className="text-neutral-400" />
                <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Identity</span>
              </div>
              {spec.username && (
                <div className="text-xs text-neutral-400 mb-1">
                  <span className="text-neutral-500">User:</span>{' '}
                  <span className="text-cyan-400 font-mono">{spec.username}</span>
                </div>
              )}
              {spec.groups && spec.groups.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {spec.groups.map((group, i) => (
                    <span
                      key={i}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-700 text-neutral-400"
                    >
                      {group}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ),
        },
      });
    }

    // Usages
    if (spec.usages?.length) {
      sections.push({
        id: 'usages',
        title: 'Key Usages',
        data: {
          type: 'custom',
          render: () => (
            <div className="flex flex-wrap gap-2">
              {spec.usages!.map((usage, i) => (
                <span
                  key={i}
                  className="text-xs px-2 py-1 rounded bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300"
                >
                  {usage}
                </span>
              ))}
            </div>
          ),
        },
      });
    }

    // Certificate issued indicator
    if (status?.certificate) {
      const decodedCert = decodeBase64(status.certificate);
      const decodedCA = status.ca ? decodeBase64(status.ca) : null;

      sections.push({
        id: 'certificate-issued',
        title: 'Certificate',
        data: {
          type: 'custom',
          render: () => (
            <div className="space-y-3">
              {decodedCert && (
                <PemDataBlock
                  title="Certificate (PEM)"
                  data={decodedCert}
                  icon={<FileCheck size={14} className="text-emerald-400" />}
                />
              )}
              {decodedCA && (
                <PemDataBlock
                  title="CA Certificate (PEM)"
                  data={decodedCA}
                  icon={<Key size={14} className="text-purple-400" />}
                />
              )}
            </div>
          ),
        },
      });
    }

    // CSR (Certificate Signing Request)
    if (spec.request) {
      const decodedCSR = decodeBase64(spec.request);
      if (decodedCSR) {
        sections.push({
          id: 'csr',
          title: 'Certificate Signing Request',
          data: {
            type: 'custom',
            render: () => (
              <PemDataBlock
                title="CSR (PEM)"
                data={decodedCSR}
                icon={<FileCheck size={14} className="text-blue-400" />}
              />
            ),
          },
        });
      }
    }

    // Conditions
    if (status?.conditions && status.conditions.length > 0) {
      sections.push({
        id: 'conditions',
        title: 'Conditions',
        data: {
          type: 'conditions' as const,
          items: status.conditions.map(c => ({
            type: c.type ?? '',
            status: c.status ?? 'Unknown',
            reason: c.reason,
            message: c.message,
          })),
        },
      });
    }

    // Failure info
    if (status?.failureTime) {
      sections.push({
        id: 'failure',
        data: {
          type: 'custom',
          render: () => (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
              <div className="flex items-center gap-2 text-red-400">
                <Clock size={14} />
                <span className="text-sm font-medium">Failed</span>
              </div>
              <div className="text-xs text-neutral-500 mt-1">
                Failure time: {formatDate(status.failureTime)}
              </div>
              {state.message && (
                <div className="text-xs text-red-400/70 mt-1">{state.message}</div>
              )}
            </div>
          ),
        },
      });
    }

    return { sections };
  },
};
