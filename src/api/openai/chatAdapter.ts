import { OpenAITextAdapter, type OpenAIChatModel } from '@tanstack/ai-openai';
import { getConfig } from '../../config';

export function createChatAdapter(model: OpenAIChatModel) {
  const baseURL = `${window.location.origin}/openai/v1`;
  return new OpenAITextAdapter(
    { baseURL, apiKey: 'not-needed', dangerouslyAllowBrowser: true },
    model
  );
}

export function getConfiguredModel(): OpenAIChatModel {
  return (getConfig().ai?.model || 'gpt-5.2') as OpenAIChatModel;
}

