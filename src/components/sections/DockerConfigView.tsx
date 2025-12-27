// DockerConfigView - Display decoded Docker config from kubernetes.io/dockerconfigjson secrets

import { useState } from 'react';
import { Server, User, Key, Eye, EyeOff, Copy, Check, FileText, ChevronDown, ChevronRight, Mail } from 'lucide-react';

// Docker config structure
interface DockerConfig {
  auths?: Record<string, {
    username?: string;
    password?: string;
    email?: string;
    auth?: string;
  }>;
}

// Decode Docker config (base64 JSON)
function decodeDockerConfig(encoded: string): DockerConfig | null {
  try {
    const decoded = atob(encoded);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

// Decode auth field (base64 encoded username:password)
function decodeAuth(auth: string): { username: string; password: string } | null {
  try {
    const decoded = atob(auth);
    const [username, ...passwordParts] = decoded.split(':');
    return { username, password: passwordParts.join(':') };
  } catch {
    return null;
  }
}

interface DockerConfigViewProps {
  encoded: string;
}

export function DockerConfigView({ encoded }: DockerConfigViewProps) {
  const [revealedRegistries, setRevealedRegistries] = useState<Set<string>>(new Set());
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  const config = decodeDockerConfig(encoded);
  const rawJson = config ? JSON.stringify(config, null, 2) : null;

  const handleCopy = async (field: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const toggleReveal = (registry: string) => {
    setRevealedRegistries(prev => {
      const next = new Set(prev);
      if (next.has(registry)) {
        next.delete(registry);
      } else {
        next.add(registry);
      }
      return next;
    });
  };

  if (!config || !config.auths) {
    return (
      <div className="bg-neutral-100 dark:bg-neutral-800/50 rounded-lg p-4">
        <span className="text-xs text-red-600 dark:text-red-400">Failed to decode Docker config</span>
      </div>
    );
  }

  const registries = Object.entries(config.auths);

  if (registries.length === 0) {
    return (
      <div className="bg-neutral-100 dark:bg-neutral-800/50 rounded-lg p-4">
        <span className="text-xs text-neutral-500 dark:text-neutral-400">No registries configured</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {registries.map(([registry, credentials]) => {
        // Try to get username/password from auth field if not directly provided
        let username = credentials.username;
        let password = credentials.password;
        
        if (!username && credentials.auth) {
          const decoded = decodeAuth(credentials.auth);
          if (decoded) {
            username = decoded.username;
            password = decoded.password;
          }
        }

        const isRevealed = revealedRegistries.has(registry);

        return (
          <div key={registry} className="bg-neutral-100 dark:bg-neutral-800/50 rounded-lg p-4">
            {/* Registry URL */}
            <div className="flex items-center gap-2 mb-3">
              <Server size={14} className="text-blue-500 dark:text-blue-400" />
              <span className="text-xs font-medium text-neutral-900 dark:text-neutral-200 break-all">
                {registry}
              </span>
            </div>

            {/* Credentials Table */}
            <table className="w-full text-xs">
              <tbody>
                {username && (
                  <tr className="border-b border-neutral-200 dark:border-neutral-700/50">
                    <td className="py-1.5 pr-3 text-neutral-500 whitespace-nowrap w-1">
                      <div className="flex items-center gap-1.5">
                        <User size={12} />
                        Username
                      </div>
                    </td>
                    <td className="py-1.5 text-neutral-900 dark:text-neutral-300">
                      {username}
                    </td>
                    <td className="py-1.5 w-1">
                      <button
                        onClick={() => handleCopy(`${registry}-username`, username)}
                        className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                        title="Copy username"
                      >
                        {copiedField === `${registry}-username` ? (
                          <Check size={12} className="text-emerald-500" />
                        ) : (
                          <Copy size={12} className="text-neutral-400" />
                        )}
                      </button>
                    </td>
                  </tr>
                )}
                {password && (
                  <tr className="border-b border-neutral-200 dark:border-neutral-700/50 last:border-0">
                    <td className="py-1.5 pr-3 text-neutral-500 whitespace-nowrap w-1">
                      <div className="flex items-center gap-1.5">
                        <Key size={12} />
                        Password
                      </div>
                    </td>
                    <td className="py-1.5 font-mono">
                      {isRevealed ? (
                        <span className="text-neutral-900 dark:text-neutral-300 break-all">{password}</span>
                      ) : (
                        <span className="text-neutral-500 dark:text-neutral-400">••••••••••••••••</span>
                      )}
                    </td>
                    <td className="py-1.5 w-1">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleCopy(`${registry}-password`, password)}
                          className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                          title="Copy password"
                        >
                          {copiedField === `${registry}-password` ? (
                            <Check size={12} className="text-emerald-500" />
                          ) : (
                            <Copy size={12} className="text-neutral-400" />
                          )}
                        </button>
                        <button
                          onClick={() => toggleReveal(registry)}
                          className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                          title={isRevealed ? 'Hide password' : 'Reveal password'}
                        >
                          {isRevealed ? (
                            <EyeOff size={12} className="text-neutral-400" />
                          ) : (
                            <Eye size={12} className="text-neutral-400" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
                {credentials.email && (
                  <tr className="border-b border-neutral-200 dark:border-neutral-700/50 last:border-0">
                    <td className="py-1.5 pr-3 text-neutral-500 whitespace-nowrap w-1">
                      <div className="flex items-center gap-1.5">
                        <Mail size={12} />
                        Email
                      </div>
                    </td>
                    <td className="py-1.5 text-neutral-900 dark:text-neutral-300">
                      {credentials.email}
                    </td>
                    <td className="py-1.5 w-1">
                      <button
                        onClick={() => handleCopy(`${registry}-email`, credentials.email!)}
                        className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                        title="Copy email"
                      >
                        {copiedField === `${registry}-email` ? (
                          <Check size={12} className="text-emerald-500" />
                        ) : (
                          <Copy size={12} className="text-neutral-400" />
                        )}
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        );
      })}

      {/* Raw JSON (collapsible) */}
      {rawJson && (
        <div className="bg-neutral-100 dark:bg-neutral-800/50 rounded-lg overflow-hidden">
          <button
            onClick={() => setShowRaw(!showRaw)}
            className="w-full flex items-center justify-between p-3 hover:bg-neutral-200/50 dark:hover:bg-neutral-700/50 transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <FileText size={14} className="text-purple-500 dark:text-purple-400" />
              <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Docker Config</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopy('raw', rawJson);
                }}
                className="p-1 rounded hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors"
                title="Copy JSON"
              >
                {copiedField === 'raw' ? (
                  <Check size={14} className="text-emerald-500" />
                ) : (
                  <Copy size={14} className="text-neutral-400" />
                )}
              </button>
              {showRaw ? (
                <ChevronDown size={14} className="text-neutral-400" />
              ) : (
                <ChevronRight size={14} className="text-neutral-400" />
              )}
            </div>
          </button>
          {showRaw && (
            <div className="border-t border-neutral-200 dark:border-neutral-700 p-3">
              <pre className="text-xs text-neutral-600 dark:text-neutral-400 font-mono whitespace-pre-wrap break-all max-h-64 overflow-y-auto">
                {rawJson}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
