/**
 * Browser-safe OpenAI wrapper that automatically injects dangerouslyAllowBrowser: true.
 * This module is used via a Vite plugin that redirects 'openai' imports here,
 * but excludes this file itself to avoid circular references.
 */
import OpenAI from 'openai-original';

export default class BrowserOpenAI extends OpenAI {
  constructor(config: ConstructorParameters<typeof OpenAI>[0]) {
    super({ ...config, dangerouslyAllowBrowser: true });
  }
}

// Re-export everything from openai
export * from 'openai-original';
