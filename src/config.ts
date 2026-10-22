// Global configuration loaded from /config.json

export interface AIConfig {
  model?: string;
}

/** Service behind a context that can be started and stopped from the UI */
export type ContextSystem = 'container' | 'docker-desktop';

export interface DockerConfig {
  contexts?: string[];
  defaultContext?: string;
  /** Contexts whose service can be started and stopped, by kind */
  systems?: Record<string, ContextSystem>;
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
  return patterns.some((pattern) => {
    if (!pattern.includes('*')) return pattern === name;
    const regex = new RegExp(`^${pattern.replace(/\*/g, '.*')}$`);
    return regex.test(name);
  });
}

export interface DockerContextLabel {
  label: string;
  /** Context name, set while several Docker contexts are listed */
  detail?: string;
}

/**
 * Display name for a docker-mode context: "Container" for Apple container and
 * "Docker" for Docker contexts. Context names stay the ids used in URLs.
 */
export function getDockerContextLabel(context: string): DockerContextLabel {
  const systems = config.docker?.systems ?? {};
  if (systems[context] === 'container') return { label: 'Container' };
  const dockerContexts = (config.docker?.contexts ?? []).filter((c) => systems[c] !== 'container');
  return dockerContexts.length > 1 ? { label: 'Docker', detail: context } : { label: 'Docker' };
}

export function formatDockerContext(context: string): string {
  const { label, detail } = getDockerContextLabel(context);
  return detail ? `${label} · ${detail}` : label;
}
