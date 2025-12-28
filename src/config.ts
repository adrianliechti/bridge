// Global configuration loaded from /config.json

export interface AIConfig {
  model?: string;
}

export interface PlatformConfig {
  /** List of namespaces belonging to the platform */
  namespaces?: string[];
  /** Configuration for namespace grouping */
  spaces?: {
    /** Ordered list of label keys to group namespaces by */
    labels?: string[];
  };
}

export interface AppConfig {
  context?: string;
  namespace?: string;

  ai?: AIConfig;
  platform?: PlatformConfig;
}

let config: AppConfig = {};

export async function loadConfig(): Promise<AppConfig> {
  try {
    const response = await fetch('/config.json');
    if (!response.ok) {
      console.warn('Failed to load config.json, using defaults');
      return config;
    }
    config = await response.json();
    return config;
  } catch (error) {
    console.warn('Error loading config.json:', error);
    return config;
  }
}

export function getConfig(): AppConfig {
  return config;
}
