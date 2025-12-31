// Global configuration loaded from /config.json

export interface Context {
  name: string;
}

export interface AIConfig {
  model?: string;
}

export interface PlatformConfig {
  /** List of namespaces belonging to the platform (supports wildcards: *-system, openshift-*) */
  namespaces?: string[];
  /** Configuration for namespace grouping */
  spaces?: {
    /** Ordered list of label keys to group namespaces by */
    labels?: string[];
  };
}

export interface DockerConfig {
  /** Whether Docker is available */
  available: boolean;
}

export interface AppConfig {
  contexts: Context[];
  
  defaultContext?: string;
  defaultNamespace?: string;

  ai?: AIConfig;
  platform?: PlatformConfig;
  docker?: DockerConfig;
}

let config: AppConfig = { contexts: [] };

export async function loadConfig(): Promise<AppConfig> {
  try {
    // Fetch config.json and contexts list in parallel
    const [configResponse, contextsResponse] = await Promise.all([
      fetch('/config.json'),
      fetch('/contexts'),
    ]);

    if (configResponse.ok) {
      const jsonConfig = await configResponse.json();
      config = { ...config, ...jsonConfig };
    } else {
      console.warn('Failed to load config.json, using defaults');
    }

    if (contextsResponse.ok) {
      const contexts: Context[] = await contextsResponse.json();
      config.contexts = contexts;
    } else {
      console.warn('Failed to load contexts, using defaults');
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
