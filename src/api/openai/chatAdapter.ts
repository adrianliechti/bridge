import { OpenAITextAdapter } from '@tanstack/ai-openai';
import { getConfig } from '../../config';

export function createChatAdapter(model: string) {
  const baseURL = `${window.location.origin}/openai/v1`;
  return new OpenAITextAdapter(
    { baseURL, apiKey: 'not-needed', dangerouslyAllowBrowser: true },
    model
  );
}

export function getConfiguredModel(): string {
  return getConfig().ai?.model || 'gpt-5.2';
}

