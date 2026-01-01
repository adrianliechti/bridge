// Global configuration loaded from /config.json

export interface AIConfig {
  model?: string;
}

export interface DockerConfig {
  contexts?: string[];
  defaultContext?: string;
}

export interface KubernetesConfig {
  contexts?: string[];
  defaultContext?: string;
  defaultNamespace?: string;
  /** Ordered list of label keys to group namespaces by */
  tenancyLabels?: string[];
  /** List of namespaces belonging to the platform (supports wildcards: *-system, openshift-*) */
  platformNamespaces?: string[];
}

export interface AppConfig {
  ai?: AIConfig;
  docker?: DockerConfig;
  kubernetes?: KubernetesConfig;
}

let config: AppConfig = {};

export async function loadConfig(): Promise<AppConfig> {
  try {
    const configResponse = await fetch('/config.json');

    if (configResponse.ok) {
      const jsonConfig = await configResponse.json();
      config = { ...config, ...jsonConfig };
    } else {
      console.warn('Failed to load config.json, using defaults');
    }

    return config;
  } catch (error) {
    console.warn('Error loading config:', error);
    return config;
  }
}

export function getConfig(): AppConfig {
  return config;
}

/**
 * Checks if a namespace name matches any of the given patterns.
 * Patterns can include wildcards (*) for flexible matching.
 * Examples: *-system, openshift-*, *monitoring*
 */
export function matchesNamespacePattern(name: string, patterns: string[]): boolean {
  return patterns.some(pattern => {
    if (!pattern.includes('*')) return pattern === name;
    const regex = new RegExp(`^${pattern.replace(/\*/g, '.*')}$`);
    return regex.test(name);
  });
}
