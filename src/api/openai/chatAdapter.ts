// TanStack AI OpenAI adapter configured for browser with local proxy
// Uses OpenAI Responses API
import type { StreamChunk, TextOptions, Modality, DefaultMessageMetadataByModality, ModelMessage, Tool } from '@tanstack/ai';
import type { StructuredOutputOptions, StructuredOutputResult } from '@tanstack/ai/adapters';
import OpenAI from 'openai';
import { getConfig } from '../../config';

// Provider options type (empty for our adapter)
type ProviderOptions = Record<string, unknown>;

// Generate unique ID
const generateId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).substring(7)}`;

// Convert TanStack tools to OpenAI Responses API format
function convertToolsToOpenAI(tools: Tool[]): OpenAI.Responses.Tool[] {
  return tools.map(tool => ({
    type: 'function' as const,
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema as Record<string, unknown>,
    strict: false,
  }));
}

/**
 * Browser-safe OpenAI Text Adapter using Responses API.
 * Creates the OpenAI client with dangerouslyAllowBrowser: true since
 * our backend handles the actual API key securely.
 */
class BrowserOpenAITextAdapter {
  readonly kind = 'text' as const;
  readonly name = 'openai';
  readonly model: string;
  readonly '~types': {
    providerOptions: ProviderOptions;
    inputModalities: readonly Modality[];
    messageMetadataByModality: DefaultMessageMetadataByModality;
  };
  private client: OpenAI;

  constructor(baseURL: string, model: string) {
    this.model = model;
    this['~types'] = {} as typeof this['~types']; // Type marker only
    this.client = new OpenAI({
      apiKey: 'not-needed',
      baseURL,
      dangerouslyAllowBrowser: true,
    });
  }

  async *chatStream(options: TextOptions<ProviderOptions>): AsyncIterable<StreamChunk> {
    const input = this.convertMessagesToInput(options.messages);
    const tools = options.tools ? convertToolsToOpenAI(options.tools) : undefined;

    const response = await this.client.responses.create({
      model: this.model,
      input,
      instructions: options.systemPrompts?.join('\n'),
      tools,
      stream: true,
    }, {
      signal: options.request?.signal,
    });

    yield* this.processStreamChunks(response);
  }

  private async *processStreamChunks(
    stream: AsyncIterable<OpenAI.Responses.ResponseStreamEvent>
  ): AsyncIterable<StreamChunk> {
    const timestamp = Date.now();
    let accumulatedContent = '';
    let accumulatedReasoning = '';
    let responseId: string | null = null;
    let model = this.model;
    const toolCallMetadata = new Map<string, { index: number; name: string }>();

    for await (const chunk of stream) {
      // Handle response metadata
      if (chunk.type === 'response.created' || chunk.type === 'response.incomplete' || chunk.type === 'response.failed') {
        responseId = chunk.response.id;
        model = chunk.response.model;
        accumulatedContent = '';
        accumulatedReasoning = '';

        if (chunk.response.error) {
          yield {
            type: 'error',
            id: chunk.response.id,
            model: chunk.response.model,
            timestamp,
            error: chunk.response.error,
          };
        }
      }

      // Handle text deltas
      if (chunk.type === 'response.output_text.delta' && chunk.delta) {
        const textDelta = typeof chunk.delta === 'string' ? chunk.delta : '';
        if (textDelta) {
          accumulatedContent += textDelta;
          yield {
            type: 'content',
            id: responseId || generateId(this.name),
            model,
            timestamp,
            delta: textDelta,
            content: accumulatedContent,
            role: 'assistant',
          };
        }
      }

      // Handle reasoning deltas (for o1/o3 models)
      if (chunk.type === 'response.reasoning_text.delta' && chunk.delta) {
        const reasoningDelta = typeof chunk.delta === 'string' ? chunk.delta : '';
        if (reasoningDelta) {
          accumulatedReasoning += reasoningDelta;
          yield {
            type: 'thinking',
            id: responseId || generateId(this.name),
            model,
            timestamp,
            delta: reasoningDelta,
            content: accumulatedReasoning,
          };
        }
      }

      // Handle tool call setup
      if (chunk.type === 'response.output_item.added') {
        const item = chunk.item;
        if (item.type === 'function_call' && item.id) {
          toolCallMetadata.set(item.id, {
            index: chunk.output_index,
            name: item.name || '',
          });
        }
      }

      // Handle tool call completion
      if (chunk.type === 'response.function_call_arguments.done') {
        const { item_id, output_index } = chunk;
        const metadata = toolCallMetadata.get(item_id);
        yield {
          type: 'tool_call',
          id: responseId || generateId(this.name),
          model,
          timestamp,
          index: output_index,
          toolCall: {
            id: item_id,
            type: 'function',
            function: {
              name: metadata?.name || '',
              arguments: chunk.arguments,
            },
          },
        };
      }

      // Handle completion
      if (chunk.type === 'response.completed') {
        const hasFunctionCalls = chunk.response.output.some(
          (item: { type: string }) => item.type === 'function_call'
        );
        yield {
          type: 'done',
          id: responseId || generateId(this.name),
          model,
          timestamp,
          usage: {
            promptTokens: chunk.response.usage?.input_tokens || 0,
            completionTokens: chunk.response.usage?.output_tokens || 0,
            totalTokens: chunk.response.usage?.total_tokens || 0,
          },
          finishReason: hasFunctionCalls ? 'tool_calls' : 'stop',
        };
      }

      // Handle errors
      if (chunk.type === 'error') {
        yield {
          type: 'error',
          id: responseId || generateId(this.name),
          model,
          timestamp,
          error: {
            message: chunk.message,
            code: chunk.code ?? undefined,
          },
        };
      }
    }
  }

  private convertMessagesToInput(messages: ModelMessage[]): OpenAI.Responses.ResponseInputItem[] {
    const result: OpenAI.Responses.ResponseInputItem[] = [];

    for (const message of messages) {
      if (message.role === 'tool') {
        result.push({
          type: 'function_call_output',
          call_id: message.toolCallId || '',
          output: typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
        });
        continue;
      }

      if (message.role === 'assistant') {
        // Handle tool calls from assistant
        if (message.toolCalls?.length) {
          for (const toolCall of message.toolCalls) {
            result.push({
              type: 'function_call',
              call_id: toolCall.id,
              name: toolCall.function.name,
              arguments: typeof toolCall.function.arguments === 'string'
                ? toolCall.function.arguments
                : JSON.stringify(toolCall.function.arguments),
            });
          }
        }
        // Handle text content
        if (message.content) {
          const contentStr = this.extractTextContent(message.content);
          if (contentStr) {
            result.push({
              type: 'message',
              role: 'assistant',
              content: contentStr,
            });
          }
        }
        continue;
      }

      // User messages
      const contentStr = this.extractTextContent(message.content);
      result.push({
        type: 'message',
        role: 'user',
        content: contentStr || '',
      });
    }

    return result;
  }

  private extractTextContent(content: ModelMessage['content']): string {
    if (content === null) return '';
    if (typeof content === 'string') return content;
    return content
      .filter((p): p is { type: 'text'; content: string } => p.type === 'text')
      .map(p => p.content)
      .join('');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async structuredOutput(_options: StructuredOutputOptions<ProviderOptions>): Promise<StructuredOutputResult<unknown>> {
    throw new Error('Structured output not implemented');
  }
}

/**
 * Create an OpenAI chat adapter pointing to our local proxy.
 */
export function createChatAdapter(model: string) {
  const baseURL = `${window.location.origin}/openai/v1`;
  return new BrowserOpenAITextAdapter(baseURL, model);
}

/**
 * Get the configured model from app config
 */
export function getConfiguredModel(): string {
  return getConfig().ai?.model || 'gpt-5.1';
}
