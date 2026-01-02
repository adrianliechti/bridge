// TanStack AI OpenAI adapter configured for browser with local proxy
// The 'openai' module is aliased in vite.config.ts to inject dangerouslyAllowBrowser
import { OpenAITextAdapter } from '@tanstack/ai-openai';
import { getConfig } from '../../config';

/**
 * Create an OpenAI chat adapter pointing to our local proxy.
 * Uses TanStack AI's OpenAITextAdapter directly since the openai module
 * is aliased to automatically inject dangerouslyAllowBrowser: true.
 */
export function createChatAdapter(model: string) {
  const baseURL = `${window.location.origin}/openai/v1`;
  return new OpenAITextAdapter({ apiKey: 'not-needed', baseURL }, model as 'gpt-5.1');
}

/**
 * Get the configured model from app config
 */
export function getConfiguredModel(): string {
  return getConfig().ai?.model || 'gpt-5.1';
}

