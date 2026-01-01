// Certificate Metadata Viewer
// Parses and displays X.509 certificate metadata from PEM-encoded certificates

/* eslint-disable react-refresh/only-export-components */

import { useState } from 'react';
import { Shield, ChevronDown, ChevronRight, AlertTriangle, CheckCircle, Clock, Copy, Check } from 'lucide-react';
import * as x509 from '@peculiar/x509';

// Common PEM certificate prefixes
const PEM_CERTIFICATE_HEADERS = [
  '-----BEGIN CERTIFICATE-----',
  '-----BEGIN X509 CERTIFICATE-----',
  '-----BEGIN TRUSTED CERTIFICATE-----',
];

const PEM_PRIVATE_KEY_HEADERS = [
  '-----BEGIN PRIVATE KEY-----',
  '-----BEGIN RSA PRIVATE KEY-----',
  '-----BEGIN EC PRIVATE KEY-----',
  '-----BEGIN ENCRYPTED PRIVATE KEY-----',
];

const PEM_PUBLIC_KEY_HEADERS = [
  '-----BEGIN PUBLIC KEY-----',
  '-----BEGIN RSA PUBLIC KEY-----',
];

const PEM_CSR_HEADERS = [
  '-----BEGIN CERTIFICATE REQUEST-----',
  '-----BEGIN NEW CERTIFICATE REQUEST-----',
];

export type PemType = 'certificate' | 'private-key' | 'public-key' | 'csr' | 'unknown';

export interface PemDetectionResult {
  type: PemType;
  content: string;
}

// Detect if content is a PEM-encoded item and what type
export function detectPemType(content: string): PemDetectionResult | null {
  const trimmed = content.trim();
  
  for (const header of PEM_CERTIFICATE_HEADERS) {
    if (trimmed.startsWith(header)) {
      return { type: 'certificate', content: trimmed };
    }
  }
  
  for (const header of PEM_PRIVATE_KEY_HEADERS) {
    if (trimmed.startsWith(header)) {
      return { type: 'private-key', content: trimmed };
    }
  }
  
  for (const header of PEM_PUBLIC_KEY_HEADERS) {
    if (trimmed.startsWith(header)) {
      return { type: 'public-key', content: trimmed };
    }
  }
  
  for (const header of PEM_CSR_HEADERS) {
    if (trimmed.startsWith(header)) {
      return { type: 'csr', content: trimmed };
    }
  }
  
  return null;
}

interface CertificateMetadata {
  subject: Record<string, string>;
  issuer: Record<string, string>;
  serialNumber: string;
  notBefore: Date;
  notAfter: Date;
  isExpired: boolean;
  isNotYetValid: boolean;
  daysUntilExpiry: number;
  keyAlgorithm: string;
  signatureAlgorithm: string;
  keyUsage?: string[];
  extKeyUsage?: string[];
  subjectAltNames?: string[];
  isSelfSigned: boolean;
  isCA: boolean;
}

// Parse certificate and extract metadata
function parseCertificate(pem: string): CertificateMetadata | null {
  try {
    const cert = new x509.X509Certificate(pem);
    const now = new Date();
    
    // Parse subject
    const subject: Record<string, string> = {};
    for (const attr of cert.subject.split(', ')) {
      const [key, value] = attr.split('=');
      if (key && value) {
        subject[key] = value;
      }
    }
    
    // Parse issuer
    const issuer: Record<string, string> = {};
    for (const attr of cert.issuer.split(', ')) {
      const [key, value] = attr.split('=');
      if (key && value) {
        issuer[key] = value;
      }
    }
    
    // Calculate expiry
    const notBefore = cert.notBefore;
    const notAfter = cert.notAfter;
    const isExpired = now > notAfter;
    const isNotYetValid = now < notBefore;
    const daysUntilExpiry = Math.ceil((notAfter.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    // Check if self-signed
    const isSelfSigned = cert.subject === cert.issuer;
    
    // Get key algorithm
    let keyAlgorithm = 'Unknown';
    try {
      const publicKey = cert.publicKey;
      keyAlgorithm = publicKey.algorithm.name || 'Unknown';
      if ('namedCurve' in publicKey.algorithm) {
        keyAlgorithm += ` (${publicKey.algorithm.namedCurve})`;
      }
      if ('modulusLength' in publicKey.algorithm) {
        keyAlgorithm += ` ${publicKey.algorithm.modulusLength}-bit`;
      }
    } catch {
      // Ignore
    }
    
    // Get signature algorithm
    const signatureAlgorithm = cert.signatureAlgorithm.name || 'Unknown';
    
    // Get extensions
    let keyUsage: string[] | undefined;
    let extKeyUsage: string[] | undefined;
    let subjectAltNames: string[] | undefined;
    let isCA = false;
    
    for (const ext of cert.extensions) {
      if (ext.type === '2.5.29.15') {
        // Key Usage
        try {
          const ku = ext as x509.KeyUsagesExtension;
          keyUsage = [];
          if (ku.usages & x509.KeyUsageFlags.digitalSignature) keyUsage.push('Digital Signature');
          if (ku.usages & x509.KeyUsageFlags.keyEncipherment) keyUsage.push('Key Encipherment');
          if (ku.usages & x509.KeyUsageFlags.dataEncipherment) keyUsage.push('Data Encipherment');
          if (ku.usages & x509.KeyUsageFlags.keyAgreement) keyUsage.push('Key Agreement');
          if (ku.usages & x509.KeyUsageFlags.keyCertSign) keyUsage.push('Certificate Signing');
          if (ku.usages & x509.KeyUsageFlags.cRLSign) keyUsage.push('CRL Signing');
          if (ku.usages & x509.KeyUsageFlags.nonRepudiation) keyUsage.push('Non-Repudiation');
        } catch {
          // Ignore
        }
      }
      
      if (ext.type === '2.5.29.37') {
        // Extended Key Usage
        try {
          const eku = ext as x509.ExtendedKeyUsageExtension;
          extKeyUsage = eku.usages.map(oid => {
            const oidStr = String(oid);
            const knownOids: Record<string, string> = {
              '1.3.6.1.5.5.7.3.1': 'Server Authentication',
              '1.3.6.1.5.5.7.3.2': 'Client Authentication',
              '1.3.6.1.5.5.7.3.3': 'Code Signing',
              '1.3.6.1.5.5.7.3.4': 'Email Protection',
              '1.3.6.1.5.5.7.3.8': 'Time Stamping',
              '1.3.6.1.5.5.7.3.9': 'OCSP Signing',
            };
            return knownOids[oidStr] || oidStr;
          });
        } catch {
          // Ignore
        }
      }
      
      if (ext.type === '2.5.29.17') {
        // Subject Alternative Names
        try {
          const san = ext as x509.SubjectAlternativeNameExtension;
          subjectAltNames = san.names.items.map(name => {
            if (name.type === 'dns') return `DNS:${name.value}`;
            if (name.type === 'ip') return `IP:${name.value}`;
            if (name.type === 'email') return `Email:${name.value}`;
            if (name.type === 'url') return `URI:${name.value}`;
            return String(name.value);
          });
        } catch {
          // Ignore
        }
      }
      
      if (ext.type === '2.5.29.19') {
        // Basic Constraints
        try {
          const bc = ext as x509.BasicConstraintsExtension;
          isCA = bc.ca;
        } catch {
          // Ignore
        }
      }
    }
    
    return {
      subject,
      issuer,
      serialNumber: cert.serialNumber,
      notBefore,
      notAfter,
      isExpired,
      isNotYetValid,
      daysUntilExpiry,
      keyAlgorithm,
      signatureAlgorithm,
      keyUsage,
      extKeyUsage,
      subjectAltNames,
      isSelfSigned,
      isCA,
    };
  } catch (e) {
    console.error('Failed to parse certificate:', e);
    return null;
  }
}

// Format date for display
function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

// Format DN (Distinguished Name) attributes
function formatDN(dn: Record<string, string>): string {
  const order = ['CN', 'O', 'OU', 'L', 'ST', 'C'];
  const parts: string[] = [];
  
  for (const key of order) {
    if (dn[key]) {
      parts.push(`${key}=${dn[key]}`);
    }
  }
  
  // Add any remaining keys
  for (const [key, value] of Object.entries(dn)) {
    if (!order.includes(key)) {
      parts.push(`${key}=${value}`);
    }
  }
  
  return parts.join(', ');
}

interface CertificateViewProps {
  name: string;
  pem: string;
}

export function CertificateView({ name, pem }: CertificateViewProps) {
  const [expanded, setExpanded] = useState(false);
  const toggleExpanded = () => setExpanded(prev => !prev);
  const [copied, setCopied] = useState(false);
  
  const metadata = parseCertificate(pem);
  
  const handleCopy = async () => {
    await navigator.clipboard.writeText(pem);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  if (!metadata) {
    return (
      <div className="bg-neutral-100 dark:bg-neutral-800/50 rounded-lg p-3">
        <div className="flex items-center gap-2">
          <AlertTriangle size={14} className="text-amber-500" />
          <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">{name}</span>
          <span className="text-xs text-neutral-500">Failed to parse certificate</span>
        </div>
      </div>
    );
  }
  
  // Determine status color
  let statusColor = 'text-emerald-500';
  let statusBg = 'bg-emerald-100 dark:bg-emerald-500/20';
  let statusText = 'Valid';
  
  if (metadata.isExpired) {
    statusColor = 'text-red-500';
    statusBg = 'bg-red-100 dark:bg-red-500/20';
    statusText = 'Expired';
  } else if (metadata.isNotYetValid) {
    statusColor = 'text-amber-500';
    statusBg = 'bg-amber-100 dark:bg-amber-500/20';
    statusText = 'Not Yet Valid';
  } else if (metadata.daysUntilExpiry <= 30) {
    statusColor = 'text-amber-500';
    statusBg = 'bg-amber-100 dark:bg-amber-500/20';
    statusText = `Expires in ${metadata.daysUntilExpiry} days`;
  }
  
  return (
    <div className="bg-neutral-100 dark:bg-neutral-800/50 rounded-lg overflow-hidden">
      <button
        onClick={toggleExpanded}
        className="w-full flex items-center justify-between p-3 hover:bg-neutral-200/50 dark:hover:bg-neutral-700/50 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <Shield size={14} className="text-blue-500 dark:text-blue-400" />
          <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">{name}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded ${statusBg} ${statusColor}`}>
            {statusText}
          </span>
          {metadata.isCA && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400">
              CA
            </span>
          )}
          {metadata.isSelfSigned && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-600/50 text-neutral-600 dark:text-neutral-400">
              Self-Signed
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleCopy();
            }}
            className="p-1 rounded hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors"
            title="Copy certificate"
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
        <div className="border-t border-neutral-200 dark:border-neutral-700 p-3 space-y-3">
          {/* Subject */}
          <div>
            <div className="text-xs text-neutral-500 mb-1">Subject</div>
            <div className="text-xs font-mono text-neutral-700 dark:text-neutral-300">
              {metadata.subject.CN || formatDN(metadata.subject)}
            </div>
            {metadata.subject.CN && Object.keys(metadata.subject).length > 1 && (
              <div className="text-xs font-mono text-neutral-500 mt-0.5">
                {formatDN(metadata.subject)}
              </div>
            )}
          </div>
          
          {/* Issuer (only if different from subject) */}
          {!metadata.isSelfSigned && (
            <div>
              <div className="text-xs text-neutral-500 mb-1">Issuer</div>
              <div className="text-xs font-mono text-neutral-700 dark:text-neutral-300">
                {metadata.issuer.CN || formatDN(metadata.issuer)}
              </div>
            </div>
          )}
          
          {/* Validity */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-neutral-500 mb-1">Not Before</div>
              <div className="text-xs font-mono text-neutral-700 dark:text-neutral-300">
                {formatDate(metadata.notBefore)}
              </div>
            </div>
            <div>
              <div className="text-xs text-neutral-500 mb-1">Not After</div>
              <div className={`text-xs font-mono flex items-center gap-1 ${metadata.isExpired ? 'text-red-500' : metadata.daysUntilExpiry <= 30 ? 'text-amber-500' : 'text-neutral-700 dark:text-neutral-300'}`}>
                {metadata.isExpired ? (
                  <AlertTriangle size={12} />
                ) : metadata.daysUntilExpiry <= 30 ? (
                  <Clock size={12} />
                ) : (
                  <CheckCircle size={12} className="text-emerald-500" />
                )}
                {formatDate(metadata.notAfter)}
              </div>
            </div>
          </div>
          
          {/* Serial Number */}
          <div>
            <div className="text-xs text-neutral-500 mb-1">Serial Number</div>
            <div className="text-xs font-mono text-neutral-700 dark:text-neutral-300 break-all">
              {metadata.serialNumber}
            </div>
          </div>
          
          {/* Algorithms */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-neutral-500 mb-1">Key Algorithm</div>
              <div className="text-xs font-mono text-neutral-700 dark:text-neutral-300">
                {metadata.keyAlgorithm}
              </div>
            </div>
            <div>
              <div className="text-xs text-neutral-500 mb-1">Signature Algorithm</div>
              <div className="text-xs font-mono text-neutral-700 dark:text-neutral-300">
                {metadata.signatureAlgorithm}
              </div>
            </div>
          </div>
          
          {/* Subject Alternative Names */}
          {metadata.subjectAltNames && metadata.subjectAltNames.length > 0 && (
            <div>
              <div className="text-xs text-neutral-500 mb-1">Subject Alternative Names</div>
              <div className="flex flex-wrap gap-1">
                {metadata.subjectAltNames.map((san, i) => (
                  <span
                    key={i}
                    className="text-xs px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 font-mono"
                  >
                    {san}
                  </span>
                ))}
              </div>
            </div>
          )}
          
          {/* Key Usage */}
          {metadata.keyUsage && metadata.keyUsage.length > 0 && (
            <div>
              <div className="text-xs text-neutral-500 mb-1">Key Usage</div>
              <div className="flex flex-wrap gap-1">
                {metadata.keyUsage.map((usage, i) => (
                  <span
                    key={i}
                    className="text-xs px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-600/50 text-neutral-600 dark:text-neutral-400"
                  >
                    {usage}
                  </span>
                ))}
              </div>
            </div>
          )}
          
          {/* Extended Key Usage */}
          {metadata.extKeyUsage && metadata.extKeyUsage.length > 0 && (
            <div>
              <div className="text-xs text-neutral-500 mb-1">Extended Key Usage</div>
              <div className="flex flex-wrap gap-1">
                {metadata.extKeyUsage.map((usage, i) => (
                  <span
                    key={i}
                    className="text-xs px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-600/50 text-neutral-600 dark:text-neutral-400"
                  >
                    {usage}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Component for displaying private key info with optional reveal
export function PrivateKeyView({ name, pem }: { name: string; pem: string }) {
  const [expanded, setExpanded] = useState(false);
  const toggleExpanded = () => setExpanded(prev => !prev);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(pem);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-neutral-100 dark:bg-neutral-800/50 rounded-lg overflow-hidden">
      <button
        onClick={toggleExpanded}
        className="w-full flex items-center justify-between p-3 hover:bg-neutral-200/50 dark:hover:bg-neutral-700/50 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <Shield size={14} className="text-red-500 dark:text-red-400" />
          <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">{name}</span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400">
            Private Key
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleCopy();
            }}
            className="p-1 rounded hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors"
            title="Copy private key"
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
          <pre className="text-xs text-neutral-600 dark:text-neutral-400 font-mono whitespace-pre-wrap break-all max-h-64 overflow-y-auto">
            {pem}
          </pre>
        </div>
      )}
    </div>
  );
}

// Component for displaying CSR info
export function CsrView({ name, pem }: { name: string; pem: string }) {
  const [expanded, setExpanded] = useState(false);
  const toggleExpanded = () => setExpanded(prev => !prev);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(pem);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-neutral-100 dark:bg-neutral-800/50 rounded-lg overflow-hidden">
      <button
        onClick={toggleExpanded}
        className="w-full flex items-center justify-between p-3 hover:bg-neutral-200/50 dark:hover:bg-neutral-700/50 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <Shield size={14} className="text-amber-500 dark:text-amber-400" />
          <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">{name}</span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400">
            Certificate Request
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleCopy();
            }}
            className="p-1 rounded hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors"
            title="Copy CSR"
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
          <pre className="text-xs text-neutral-600 dark:text-neutral-400 font-mono whitespace-pre-wrap break-all max-h-64 overflow-y-auto">
            {pem}
          </pre>
        </div>
      )}
    </div>
  );
}

// Component for displaying public key info
export function PublicKeyView({ name }: { name: string }) {
  return (
    <div className="bg-neutral-100 dark:bg-neutral-800/50 rounded-lg p-3">
      <div className="flex items-center gap-2">
        <Shield size={14} className="text-blue-500 dark:text-blue-400" />
        <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">{name}</span>
        <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400">
          Public Key
        </span>
      </div>
    </div>
  );
}
