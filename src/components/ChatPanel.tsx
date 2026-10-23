import { useRef, useEffect, useState, useMemo } from 'react';
import { Send, X, Trash2, Square, Loader2 } from 'lucide-react';
import { useChat, stream, type UIMessage } from '@tanstack/ai-react';
import { chat, maxIterations, type AnyClientTool } from '@tanstack/ai';
import { createChatAdapter, getConfiguredModel } from '../api/openai/chatAdapter';
import type { ChatAdapterConfig, ChatEnvironment } from '../types/chat';
import { Markdown } from './Markdown';

interface ChatPanelProps<T extends ChatEnvironment = ChatEnvironment> {
  isOpen: boolean;
  onClose: () => void;
  otherPanelOpen?: boolean;
  adapterConfig: ChatAdapterConfig;
  /** Unique identifier for the current context (e.g., cluster name, docker context).
   *  Chat history is cleared when this changes. */
  contextId?: string;
  environment: T;
  tools: AnyClientTool[];
  buildInstructions: (environment: T) => string;
}

export function ChatPanel<T extends ChatEnvironment>({
  isOpen,
  onClose,
  otherPanelOpen = false,
  adapterConfig,
  contextId,
  environment,
  tools,
  buildInstructions,
}: ChatPanelProps<T>) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Latest environment/instructions/tools for the connection callback, so it
  // always reads current values without recreating the connection on every
  // nav change. Written in an effect (never during render); the callback only
  // runs on user-initiated sends, which happen after the commit that
  // refreshed the refs.
  const environmentRef = useRef(environment);
  const buildInstructionsRef = useRef(buildInstructions);
  const toolsRef = useRef(tools);
  useEffect(() => {
    environmentRef.current = environment;
    buildInstructionsRef.current = buildInstructions;
    toolsRef.current = tools;
  });

  // Stable connection — only recreated when adapter or context changes,
  // NOT on every navigation/environment change.
  const connection = useMemo(() => {
    const model = getConfiguredModel();
    const adapter = createChatAdapter(model);

    // The refs below are only dereferenced when the user sends a message —
    // never during render — so reading them inside this callback is safe.
    // eslint-disable-next-line react-hooks/refs
    return stream((messages) => {
      const instructions = buildInstructionsRef.current(environmentRef.current as T);
      return chat({
        adapter,
        messages,
        tools: toolsRef.current,
        systemPrompts: [instructions],
        agentLoopStrategy: maxIterations(10),
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapterConfig.id, contextId]);

  // Keying the chat client by adapter + context makes useChat rebuild it (and
  // start with a fresh message list) whenever either changes — the client
  // reads `connection` only at construction time, and the old client is
  // stopped and disposed by useChat's own cleanup.
  const { messages, sendMessage, isLoading, stop, clear, error } = useChat({
    id: `${adapterConfig.id}/${contextId ?? ''}`,
    connection,
    tools,
  });

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    // Inject current context into the message so LLM knows current state
    const contextInfo = [];
    const env = environment as {
      currentNamespace?: string;
      selectedResourceKind?: string;
      selectedResourceName?: string;
    };
    if (env.currentNamespace) contextInfo.push(`Namespace: ${env.currentNamespace}`);
    if (env.selectedResourceKind) contextInfo.push(`Viewing: ${env.selectedResourceKind}`);
    if (env.selectedResourceName) contextInfo.push(`Selected: ${env.selectedResourceName}`);

    const messageWithContext =
      contextInfo.length > 0
        ? `[Current context: ${contextInfo.join(', ')}]\n\n${input.trim()}`
        : input.trim();

    sendMessage(messageWithContext);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  // Extract text content from message parts
  // Filter by type='text' AND truthy content to avoid undefined/empty
  const getMessageContent = (message: UIMessage): string => {
    return message.parts
      .filter(
        (part): part is { type: 'text'; content: string } =>
          part.type === 'text' && Boolean(part.content),
      )
      .map((part) => part.content)
      .join('');
  };

  // Check if message is currently streaming (last assistant message while loading)
  const isStreaming = (message: UIMessage, index: number): boolean => {
    return isLoading && message.role === 'assistant' && index === messages.length - 1;
  };

  return (
    <div
      className={`fixed top-0 right-0 h-screen bg-bg border-l border-border-subtle flex flex-col transition-all duration-300 ease-in-out z-30 ${
        isOpen ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-full pointer-events-none'
      }`}
      style={{
        width: otherPanelOpen ? 'min(28rem, 100vw)' : 'min(40rem, 100vw)',
      }}
    >
      {/* Header */}
      <div className="window-drag window-controls-end shrink-0 h-12 pl-4 pr-2 flex items-center justify-between border-b border-border-subtle">
        <h3 className="text-[13px] font-semibold text-fg">{adapterConfig.name}</h3>
        <div className="window-no-drag flex items-center gap-1">
          <button onClick={clear} className="toolbar-button" title="Clear chat">
            <Trash2 size={16} />
          </button>
          <button onClick={onClose} aria-label="Close assistant" className="toolbar-button">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {messages.map((message, index) => {
          const content = getMessageContent(message);

          return (
            <div
              key={message.id}
              className={`text-sm ${
                message.role === 'user'
                  ? 'bg-bg-surface -mx-4 px-4 py-3 border-l-2 border-border-strong'
                  : ''
              }`}
            >
              <div className="text-fg">
                {message.role === 'assistant' ? (
                  content ? (
                    <Markdown>{content}</Markdown>
                  ) : isStreaming(message, index) ? (
                    <span className="flex items-center gap-2 text-fg-dim">
                      <Loader2 size={14} className="animate-spin" />
                      Thinking...
                    </span>
                  ) : null
                ) : (
                  <span className="whitespace-pre-wrap">{content}</span>
                )}
              </div>
            </div>
          );
        })}

        {/* Stream/connection errors (e.g. AI backend unreachable) */}
        {error && !isLoading && (
          <div className="text-xs text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">
            {error.message || 'The assistant request failed. Please try again.'}
          </div>
        )}

        {/* Loading indicator when no assistant message yet */}
        {isLoading && (messages.length === 0 || messages[messages.length - 1]?.role === 'user') && (
          <div className="text-sm">
            <div className="text-fg">
              <span className="flex items-center gap-2 text-fg-dim">
                <Loader2 size={14} className="animate-spin" />
                Thinking...
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="shrink-0 p-4 border-t border-border-subtle">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={adapterConfig.placeholder}
            rows={1}
            disabled={isLoading}
            className="flex-1 px-4 py-2.5 bg-bg-input border border-border-subtle hover:border-border rounded-xl text-fg text-sm placeholder:text-fg-dim resize-none focus:outline-none focus:border-border-strong disabled:opacity-50"
            style={{ maxHeight: '120px' }}
          />
          <button
            type={isLoading ? 'button' : 'submit'}
            onClick={isLoading ? stop : undefined}
            disabled={!isLoading && !input.trim()}
            className="p-2.5 bg-fg text-bg hover:opacity-90 disabled:bg-bg-elevated disabled:text-fg-dim disabled:hover:opacity-100 rounded-xl transition"
          >
            {isLoading ? <Square size={18} /> : <Send size={18} />}
          </button>
        </div>
      </form>
    </div>
  );
}
