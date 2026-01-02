// Chat adapter types for platform-agnostic chat functionality
import type { AnyClientTool } from '@tanstack/ai';

/**
 * Environment context about what the user is currently viewing
 */
export interface ChatEnvironment {
  /** Platform-specific context data */
  [key: string]: unknown;
}

/**
 * Adapter configuration for platform-specific chat functionality
 */
export interface ChatAdapterConfig {
  /** Unique identifier for this adapter */
  id: string;
  
  /** Display name for the chat assistant */
  name: string;
  
  /** Placeholder text for the input field */
  placeholder: string;
}

/**
 * Function type for creating client tools
 */
export type CreateToolsFn<TEnv extends ChatEnvironment> = (environment: TEnv) => AnyClientTool[];

/**
 * Function type for building system instructions
 */
export type BuildInstructionsFn<TEnv extends ChatEnvironment> = (environment: TEnv) => string;
