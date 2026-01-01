// Chat adapter types for platform-agnostic chat functionality
import type { Tool, ToolCall, ToolResult, Message } from '../api/openai/openai';

/**
 * Environment context about what the user is currently viewing
 */
export interface ChatEnvironment {
  /** Platform-specific context data */
  [key: string]: unknown;
}

/**
 * Options for the chat function
 */
export interface ChatOptions {
  environment: ChatEnvironment;
  model?: string;
  instructions?: string;
  onStream?: (delta: string, snapshot: string) => void;
  onToolCall?: (toolName: string, args: Record<string, string>) => void;
}

/**
 * Result from a chat interaction
 */
export interface ChatResult {
  response: Message;
  history: Message[];
}

/**
 * Adapter interface for platform-specific chat functionality
 */
export interface ChatAdapter {
  /** Unique identifier for this adapter */
  id: string;
  
  /** Display name for the chat assistant */
  name: string;
  
  /** Placeholder text for the input field */
  placeholder: string;
  
  /** Available tools for this platform */
  tools: Tool[];
  
  /**
   * Execute a tool call and return the result
   */
  executeTool(toolCall: ToolCall, environment: ChatEnvironment): Promise<ToolResult>;
  
  /**
   * Build system instructions based on environment context
   */
  buildInstructions(environment: ChatEnvironment): string;
}
