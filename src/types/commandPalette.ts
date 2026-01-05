import type { LucideIcon } from 'lucide-react';

/**
 * Represents a resource type that can be browsed (e.g., "Pods", "Containers")
 */
export interface ResourceTypeItem {
  kind: string;
  label: string;
  icon: LucideIcon;
  category: string;
  /** Short aliases for the resource type (e.g., 'po' for pods, 'deploy' for deployments) */
  aliases?: string[];
}

/**
 * Represents a namespace or scope for filtering resources
 */
export interface NamespaceItem {
  name: string;
}

/**
 * Represents a Kubernetes context (cluster)
 */
export interface ContextItem {
  name: string;
  cluster?: string;
  isCurrent?: boolean;
}

/**
 * Generic search result from command palette
 */
export interface SearchResult {
  id: string;
  type: 'resource-type' | 'namespace' | 'context' | 'resource';
  label: string;
  sublabel?: string;
  icon: LucideIcon;
  category?: string;
  /** Platform-specific data payload */
  data: Record<string, unknown>;
  /** Value to use when completing this result (e.g., the resource name) */
  completionValue?: string;
}

/**
 * Search modes supported by the command palette
 */
export type SearchMode = 'default' | 'resources' | 'namespaces' | 'contexts' | 'search' | 'searchAll' | 'filter';

/**
 * Parsed query from command palette input
 */
export interface ParsedQuery {
  /** The search mode determined from prefix */
  mode: SearchMode;
  /** The resource kind if specified (e.g., 'pods' from ':pods nginx') */
  resourceKind?: string;
  /** The search query after prefix and kind extraction */
  query: string;
  /** Whether to search all namespaces (:: prefix) */
  allNamespaces: boolean;
  /** Original prefix used */
  prefix: string;
}

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
  
  /** Whether this platform supports contexts */
  supportsContexts?: boolean;
  
  /**
   * Initialize the adapter (e.g., load resource configs)
   */
  initialize(): Promise<void>;
  
  /**
   * Get available resource types (may filter based on availability)
   */
  getAvailableResourceTypes(): ResourceTypeItem[];
  
  /**
   * Get namespaces/scopes (if supported)
   */
  getNamespaces(): NamespaceItem[];
  
  /**
   * Get contexts/clusters (if supported)
   */
  getContexts?(): ContextItem[];
  
  /**
   * Convert a resource type to a search result
   */
  resourceTypeToSearchResult(item: ResourceTypeItem): SearchResult;
  
  /**
   * Convert a namespace to a search result
   */
  namespaceToSearchResult?(item: NamespaceItem): SearchResult;
  
  /**
   * Convert a context to a search result
   */
  contextToSearchResult?(item: ContextItem): SearchResult;
  
  /**
   * Search for resources matching the query
   * @param query Search term
   * @param allScopes Whether to search all namespaces/scopes
   * @param resourceKind Optional resource kind to filter by
   */
  searchResources(query: string, allScopes: boolean, resourceKind?: string): Promise<SearchResult[]>;
  
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
  
  /**
   * Find a resource type by name, kind, or alias
   */
  findResourceType?(query: string): ResourceTypeItem | undefined;
}
