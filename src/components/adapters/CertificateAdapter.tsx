// Certificate Adapter (cert-manager.io/v1)
// Extracts display data from cert-manager Certificate resources

import { Shield, Clock, Key, Lock, CheckCircle2, AlertCircle, RefreshCw, XCircle } from 'lucide-react';
import type { ResourceAdapter, ResourceSections, StatusLevel, Section } from './types';


// cert-manager Certificate types
interface IssuerRef {
  name: string;
  kind: string;
  group?: string;
}

interface PrivateKey {
  algorithm?: string;
  size?: number;
  encoding?: string;
  rotationPolicy?: string;
}

interface CertificateCondition {
  type: string;
  status: string;
  lastTransitionTime?: string;
  reason?: string;
  message?: string;
  observedGeneration?: number;
}

interface CertificateSpec {
  secretName: string;
  issuerRef: IssuerRef;
  commonName?: string;
  duration?: string;
  renewBefore?: string;
  dnsNames?: string[];
  ipAddresses?: string[];
  uris?: string[];
  emailAddresses?: string[];
  isCA?: boolean;
  usages?: string[];
  privateKey?: PrivateKey;
  subject?: {
    organizations?: string[];
    countries?: string[];
    organizationalUnits?: string[];
    localities?: string[];
    provinces?: string[];
    streetAddresses?: string[];
    postalCodes?: string[];
    serialNumber?: string;
  };
  keystores?: {
    jks?: { create: boolean; passwordSecretRef?: { name: string; key: string } };
    pkcs12?: { create: boolean; passwordSecretRef?: { name: string; key: string } };
  };
}

interface CertificateStatus {
  conditions?: CertificateCondition[];
  notAfter?: string;
  notBefore?: string;
  renewalTime?: string;
  revision?: number;
  nextPrivateKeySecretName?: string;
  failedIssuanceAttempts?: number;
  lastFailureTime?: string;
}

interface Certificate {
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
  spec?: CertificateSpec;
  status?: CertificateStatus;
}

// Helper functions
function getReadyStatus(conditions?: CertificateCondition[]): { ready: boolean; reason?: string; message?: string } {
  const readyCondition = conditions?.find(c => c.type === 'Ready');
  if (!readyCondition) {
    return { ready: false };
  }
  return {
    ready: readyCondition.status === 'True',
    reason: readyCondition.reason,
    message: readyCondition.message,
  };
}

function getStatusLevel(ready: boolean, reason?: string): StatusLevel {
  if (ready) return 'success';
  if (reason === 'Issuing' || reason === 'Pending') return 'warning';
  return 'error';
}

function getStatusIcon(ready: boolean, reason?: string) {
  if (ready) {
    return <CheckCircle2 size={14} className="text-emerald-400" />;
  }
  if (reason === 'Issuing' || reason === 'Pending') {
    return <RefreshCw size={14} className="text-amber-400 animate-spin" />;
  }
  return <XCircle size={14} className="text-red-400" />;
}

function formatDuration(duration?: string): string {
  if (!duration) return 'Default (90d)';
  // Parse Go duration format (e.g., "87600h" -> "10y")
  const match = duration.match(/^(\d+)h$/);
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

function getTimeUntil(dateStr?: string): { text: string; status: StatusLevel } {
  if (!dateStr) return { text: 'Unknown', status: 'neutral' };
  
  const now = new Date();
  const target = new Date(dateStr);
  const diffMs = target.getTime() - now.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffMs < 0) {
    return { text: 'Expired', status: 'error' };
  }
  
  if (diffDays < 7) {
    return { text: `${diffDays}d remaining`, status: 'error' };
  }
  
  if (diffDays < 30) {
    return { text: `${diffDays}d remaining`, status: 'warning' };
  }
  
  if (diffDays > 365) {
    const years = Math.floor(diffDays / 365);
    return { text: `${years}y remaining`, status: 'success' };
  }
  
  if (diffDays > 30) {
    const months = Math.floor(diffDays / 30);
    return { text: `${months}mo remaining`, status: 'success' };
  }
  
  return { text: `${diffDays}d remaining`, status: 'success' };
}

function getAlgorithmDisplay(privateKey?: PrivateKey): string {
  if (!privateKey) return 'RSA 2048';
  const algo = privateKey.algorithm ?? 'RSA';
  const size = privateKey.size ?? (algo === 'ECDSA' ? 256 : 2048);
  return `${algo} ${size}`;
}

export const CertificateAdapter: ResourceAdapter<Certificate> = {
  kinds: ['Certificate', 'Certificates'],

  adapt(_context: string, resource): ResourceSections {
    const spec = resource.spec;
    const status = resource.status;

    if (!spec) {
      return { sections: [] };
    }

    const { ready, reason } = getReadyStatus(status?.conditions);
    const expiry = getTimeUntil(status?.notAfter);

    const sections: Section[] = [
      // Status overview
      {
        id: 'status',
        data: {
          type: 'status-cards',
          items: [
            { 
              label: 'Status', 
              value: ready ? 'Ready' : (reason ?? 'Not Ready'),
              status: getStatusLevel(ready, reason),
              icon: getStatusIcon(ready, reason),
            },
            { 
              label: 'Expires', 
              value: expiry.text,
              status: expiry.status,
              icon: <Clock size={14} className={
                expiry.status === 'error' ? 'text-red-400' :
                expiry.status === 'warning' ? 'text-amber-400' :
                'text-emerald-400'
              } />
            },
            { 
              label: 'Type', 
              value: spec.isCA ? 'CA Certificate' : 'TLS Certificate',
              status: 'neutral' as const,
              icon: <Shield size={14} className={spec.isCA ? 'text-purple-400' : 'text-blue-400'} />
            },
            {
              label: 'Revision',
              value: status?.revision ?? 1,
              status: 'neutral' as const,
            },
          ],
        },
      },
    ];

    // Certificate Details
    sections.push({
      id: 'details',
      title: 'Certificate Details',
      data: {
        type: 'info-grid',
        columns: 2,
        items: [
          { label: 'Secret Name', value: spec.secretName },
          ...(spec.commonName ? [{ label: 'Common Name', value: spec.commonName }] : []),
          { label: 'Duration', value: formatDuration(spec.duration) },
          { label: 'Algorithm', value: getAlgorithmDisplay(spec.privateKey) },
          ...(status?.notBefore ? [{ label: 'Valid From', value: formatDate(status.notBefore) }] : []),
          ...(status?.notAfter ? [{ label: 'Valid Until', value: formatDate(status.notAfter) }] : []),
          ...(status?.renewalTime ? [{ label: 'Renewal Time', value: formatDate(status.renewalTime) }] : []),
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

    // DNS Names
    if (spec.dnsNames?.length) {
      sections.push({
        id: 'dns-names',
        title: 'DNS Names',
        data: {
          type: 'custom',
          render: () => (
            <div className="flex flex-wrap gap-2">
              {spec.dnsNames!.map((name, i) => (
                <span 
                  key={i} 
                  className="text-xs px-2 py-1 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30"
                >
                  {name}
                </span>
              ))}
            </div>
          ),
        },
      });
    }

    // IP Addresses
    if (spec.ipAddresses?.length) {
      sections.push({
        id: 'ip-addresses',
        title: 'IP Addresses',
        data: {
          type: 'custom',
          render: () => (
            <div className="flex flex-wrap gap-2">
              {spec.ipAddresses!.map((ip, i) => (
                <span 
                  key={i} 
                  className="text-xs px-2 py-1 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                >
                  {ip}
                </span>
              ))}
            </div>
          ),
        },
      });
    }

    // URIs
    if (spec.uris?.length) {
      sections.push({
        id: 'uris',
        title: 'URIs',
        data: {
          type: 'custom',
          render: () => (
            <div className="space-y-1">
              {spec.uris!.map((uri, i) => (
                <div key={i} className="text-xs text-neutral-700 dark:text-neutral-300 font-mono">{uri}</div>
              ))}
            </div>
          ),
        },
      });
    }

    // Email Addresses
    if (spec.emailAddresses?.length) {
      sections.push({
        id: 'email-addresses',
        title: 'Email Addresses',
        data: {
          type: 'custom',
          render: () => (
            <div className="flex flex-wrap gap-2">
              {spec.emailAddresses!.map((email, i) => (
                <span 
                  key={i} 
                  className="text-xs px-2 py-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30"
                >
                  {email}
                </span>
              ))}
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

    // Private Key Configuration
    if (spec.privateKey) {
      sections.push({
        id: 'private-key',
        title: 'Private Key',
        data: {
          type: 'custom',
          render: () => (
            <div className="bg-neutral-100 dark:bg-neutral-900/50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Lock size={14} className="text-neutral-400" />
                <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Configuration</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-neutral-500">Algorithm:</span>
                  <span className="ml-1 text-neutral-700 dark:text-neutral-300">{spec.privateKey!.algorithm ?? 'RSA'}</span>
                </div>
                <div>
                  <span className="text-neutral-500">Size:</span>
                  <span className="ml-1 text-neutral-700 dark:text-neutral-300">{spec.privateKey!.size ?? 2048}</span>
                </div>
                {spec.privateKey!.encoding && (
                  <div>
                    <span className="text-neutral-500">Encoding:</span>
                    <span className="ml-1 text-neutral-700 dark:text-neutral-300">{spec.privateKey!.encoding}</span>
                  </div>
                )}
                {spec.privateKey!.rotationPolicy && (
                  <div>
                    <span className="text-neutral-500">Rotation:</span>
                    <span className="ml-1 text-neutral-700 dark:text-neutral-300">{spec.privateKey!.rotationPolicy}</span>
                  </div>
                )}
              </div>
            </div>
          ),
        },
      });
    }

    // Subject (if defined)
    if (spec.subject && Object.keys(spec.subject).some(k => {
      const val = spec.subject![k as keyof typeof spec.subject];
      return Array.isArray(val) ? val.length > 0 : !!val;
    })) {
      const subjectParts: string[] = [];
      if (spec.subject.organizations?.length) {
        subjectParts.push(`O=${spec.subject.organizations.join(', ')}`);
      }
      if (spec.subject.organizationalUnits?.length) {
        subjectParts.push(`OU=${spec.subject.organizationalUnits.join(', ')}`);
      }
      if (spec.subject.countries?.length) {
        subjectParts.push(`C=${spec.subject.countries.join(', ')}`);
      }
      if (spec.subject.localities?.length) {
        subjectParts.push(`L=${spec.subject.localities.join(', ')}`);
      }
      if (spec.subject.provinces?.length) {
        subjectParts.push(`ST=${spec.subject.provinces.join(', ')}`);
      }
      
      sections.push({
        id: 'subject',
        title: 'Subject',
        data: {
          type: 'custom',
          render: () => (
            <div className="text-xs text-neutral-700 dark:text-neutral-300 font-mono bg-neutral-100 dark:bg-neutral-900/50 rounded p-2">
              {subjectParts.join(', ')}
            </div>
          ),
        },
      });
    }

    // Keystores
    if (spec.keystores) {
      const keystoreTypes: string[] = [];
      if (spec.keystores.jks?.create) keystoreTypes.push('JKS');
      if (spec.keystores.pkcs12?.create) keystoreTypes.push('PKCS#12');
      
      if (keystoreTypes.length > 0) {
        sections.push({
          id: 'keystores',
          title: 'Keystores',
          data: {
            type: 'custom',
            render: () => (
              <div className="flex flex-wrap gap-2">
                {keystoreTypes.map((type, i) => (
                  <span 
                    key={i} 
                    className="text-xs px-2 py-1 rounded bg-green-500/20 text-green-300 border border-green-500/30"
                  >
                    {type}
                  </span>
                ))}
              </div>
            ),
          },
        });
      }
    }

    // Failed issuance info
    if (status?.failedIssuanceAttempts && status.failedIssuanceAttempts > 0) {
      sections.push({
        id: 'failed-issuance',
        data: {
          type: 'custom',
          render: () => (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
              <div className="flex items-center gap-2 text-red-400">
                <AlertCircle size={14} />
                <span className="text-sm font-medium">Failed Issuance Attempts: {status.failedIssuanceAttempts}</span>
              </div>
              {status.lastFailureTime && (
                <div className="text-xs text-neutral-500 mt-1">
                  Last failure: {formatDate(status.lastFailureTime)}
                </div>
              )}
            </div>
          ),
        },
      });
    }

    // Conditions
    if (status?.conditions && status.conditions.length > 0) {
      sections.push({
        id: 'conditions',
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

    return { sections };
  },
};
