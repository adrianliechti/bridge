// OpenAI API client with tool calling support
import OpenAI from 'openai';

// Initialize OpenAI client pointing to local proxy
const openai = new OpenAI({
  baseURL: `${window.location.origin}/openai/v1`,
  apiKey: 'not-needed', // API key handled by proxy
  dangerouslyAllowBrowser: true, // Required for browser usage
});

// Message types
export const Role = {
  User: 'user',
  Assistant: 'assistant',
  Tool: 'tool',
} as const;

export type Role = (typeof Role)[keyof typeof Role];

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ToolResult {
  id: string;
  data: unknown;
}

export interface Message {
  role: Role;
  content: string;
  toolCalls?: ToolCall[];
  toolResult?: ToolResult;
}

// Tool definition types
export interface ToolParameter {
  type: string;
  description: string;
  enum?: string[];
}

export interface Tool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, ToolParameter>;
    required: string[];
  };
}

// Convert tools to OpenAI format
function toOpenAITools(tools: Tool[]): OpenAI.Responses.Tool[] {
  return tools.map((tool) => ({
    type: 'function' as const,
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    strict: false,
  }));
}

// Main chat completion function with tool calling support
export async function complete(
  model: string,
  instructions: string,
  input: Message[],
  tools: Tool[],
  handler?: (delta: string, snapshot: string) => void
): Promise<Message> {
  // Build input items for the Responses API
  const items: OpenAI.Responses.ResponseInputItem[] = [];

  for (const m of input) {
    switch (m.role) {
      case Role.User: {
        items.push({
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: m.content }],
        });
        break;
      }

      case Role.Tool: {
        if (m.toolResult) {
          const content =
            typeof m.toolResult.data === 'string'
              ? m.toolResult.data
              : JSON.stringify(m.toolResult.data);

          items.push({
            type: 'function_call_output',
            call_id: m.toolResult.id,
            output: content,
          });
        }
        break;
      }

      case Role.Assistant: {
        if (m.toolCalls && m.toolCalls.length > 0) {
          for (const tc of m.toolCalls) {
            items.push({
              type: 'function_call',
              call_id: tc.id,
              name: tc.name,
              arguments: tc.arguments,
            });
          }
        } else {
          items.push({
            type: 'message',
            role: 'assistant',
            content: m.content,
          });
        }
        break;
      }
    }
  }

  // Create streaming response
  const runner = openai.responses.stream({
    model,
    tools: toOpenAITools(tools),
    input: items,
    instructions,
  });

  // Handle streaming deltas
  if (handler) {
    let snapshot = '';
    runner.on('response.output_text.delta', (event) => {
      const delta = event.delta;
      snapshot += delta;
      handler(delta, snapshot);
    });
  }

  const response = await runner.finalResponse();

  if (!response.output) {
    return {
      role: Role.Assistant,
      content: '',
    };
  }

  // Extract message and tool calls from response
  let content = '';
  const toolCalls: ToolCall[] = [];

  for (const item of response.output) {
    if (item.type === 'message') {
      if (item.content) {
        for (const part of item.content) {
          if (part.type === 'output_text') {
            content = part.text;
          }
        }
      }
    } else if (item.type === 'function_call') {
      if (item.call_id) {
        toolCalls.push({
          id: item.call_id,
          name: item.name,
          arguments: item.arguments,
        });
      }
    }
  }

  return {
    role: Role.Assistant,
    content,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
  };
}