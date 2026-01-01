import type { LucideIcon } from 'lucide-react';

/**
 * Represents a resource type that can be browsed (e.g., "Pods", "Containers")
 */
export interface ResourceTypeItem {
  kind: string;
  label: string;
  icon: LucideIcon;
  category: string;
}

/**
 * Represents a namespace or scope for filtering resources
 */
export interface NamespaceItem {
  name: string;
}

/**
 * Generic search result from command palette
 */
export interface SearchResult {
  id: string;
  type: 'resource-type' | 'namespace' | 'resource';
  label: string;
  sublabel?: string;
  icon: LucideIcon;
  category?: string;
  /** Platform-specific data payload */
  data: Record<string, unknown>;
}

/**
 * Search modes supported by the command palette
 */
export type SearchMode = 'default' | 'resources' | 'namespaces' | 'search' | 'searchAll';

/**
 * Configuration for search mode prefixes
 */
export interface SearchModeConfig {
  prefix: string;
  mode: SearchMode;
}

/**
 * Adapter interface for platform-specific command palette functionality
 */
export interface CommandPaletteAdapter {
  /** Unique identifier for this adapter */
  id: string;
  
  /** Available resource types for this platform */
  resourceTypes: ResourceTypeItem[];
  
  /** Search mode prefix configurations */
  searchModePrefixes: SearchModeConfig[];
  
  /** Whether this platform supports namespaces */
  supportsNamespaces: boolean;
  
  /**
   * Initialize the adapter (e.g., load resource configs)
   * @returns Cleanup function if needed
   */
  initialize?: () => Promise<void>;
  
  /**
   * Get available resource types (may filter based on availability)
   */
  getAvailableResourceTypes(): ResourceTypeItem[];
  
  /**
   * Get namespaces/scopes (if supported)
   */
  getNamespaces(): NamespaceItem[];
  
  /**
   * Convert a resource type to a search result
   */
  resourceTypeToSearchResult(item: ResourceTypeItem): SearchResult;
  
  /**
   * Convert a namespace to a search result
   */
  namespaceToSearchResult?(item: NamespaceItem): SearchResult;
  
  /**
   * Search for resources matching the query
   * @param query Search term
   * @param allScopes Whether to search all namespaces/scopes
   */
  searchResources(query: string, allScopes: boolean): Promise<SearchResult[]>;
  
  /**
   * Handle selection of a search result
   * @param result The selected result
   */
  handleSelect(result: SearchResult): void;
  
  /**
   * Get placeholder text based on current search mode
   */
  getPlaceholder(searchMode: SearchMode, currentScope?: string): string;
  
  /**
   * Get help text items for the empty state
   */
  getHelpItems(): { prefix: string; label: string }[];
  
  /**
   * Get current scope label for footer (if applicable)
   */
  getCurrentScopeLabel?(): string | null;
}
