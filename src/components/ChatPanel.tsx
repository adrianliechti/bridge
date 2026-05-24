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
  
  // Track adapter + context changes to reset chat
  const prevAdapterIdRef = useRef(adapterConfig.id);
  const prevContextIdRef = useRef(contextId);

  // Keep latest environment in a ref so the connection callback always reads
  // the current value without causing connection recreation on every nav change.
  const environmentRef = useRef(environment);
  environmentRef.current = environment;

  const buildInstructionsRef = useRef(buildInstructions);
  buildInstructionsRef.current = buildInstructions;

  const toolsRef = useRef(tools);
  toolsRef.current = tools;

  // Stable connection — only recreated when adapter or context changes,
  // NOT on every navigation/environment change.
  const connection = useMemo(() => {
    const model = getConfiguredModel();
    const adapter = createChatAdapter(model);

    return stream((messages) => {
      const instructions = buildInstructionsRef.current(environmentRef.current as T);
      return chat({
        adapter,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        messages: messages as any,
        tools: toolsRef.current,
        systemPrompts: [instructions],
        agentLoopStrategy: maxIterations(10),
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapterConfig.id, contextId]);

  const { messages, sendMessage, isLoading, stop, clear } = useChat({
    connection,
    tools,
  });

  // Reset chat when adapter or context changes. stop() aborts any in-flight
  // stream first, otherwise late-arriving tokens from the previous context
  // can land in the cleared message list.
  useEffect(() => {
    const adapterChanged = prevAdapterIdRef.current !== adapterConfig.id;
    const contextChanged = prevContextIdRef.current !== contextId;
    if (adapterChanged || contextChanged) {
      stop();
      clear();
      prevAdapterIdRef.current = adapterConfig.id;
      prevContextIdRef.current = contextId;
    }
  }, [adapterConfig.id, contextId, clear, stop]);

  // Abort any in-flight stream when the panel unmounts (e.g., parent remounts
  // via key change on context switch). useChat does not guarantee teardown.
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

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
    const env = environment as { currentNamespace?: string; selectedResourceKind?: string; selectedResourceName?: string };
    if (env.currentNamespace) contextInfo.push(`Namespace: ${env.currentNamespace}`);
    if (env.selectedResourceKind) contextInfo.push(`Viewing: ${env.selectedResourceKind}`);
    if (env.selectedResourceName) contextInfo.push(`Selected: ${env.selectedResourceName}`);
    
    const messageWithContext = contextInfo.length > 0
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
      .filter((part): part is { type: 'text'; content: string } => 
        part.type === 'text' && Boolean(part.content)
      )
      .map(part => part.content)
      .join('')
      .replace(/^undefined/, ''); // Remove "undefined" prefix from library bug
  };

  // Check if message is currently streaming (last assistant message while loading)
  const isStreaming = (message: UIMessage, index: number): boolean => {
    return isLoading && 
           message.role === 'assistant' && 
           index === messages.length - 1;
  };

  return (
    <div
      className={`fixed top-0 right-0 h-screen bg-white border-l border-neutral-200 dark:bg-neutral-900 dark:border-neutral-800 flex flex-col transition-all duration-300 ease-in-out z-30 ${
        isOpen ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-full pointer-events-none'
      }`}
      style={{
        width: otherPanelOpen ? '28rem' : '40rem',
      }}
    >
      {/* Header */}
      <div className="shrink-0 h-16 px-4 flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800">
        <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">{adapterConfig.name}</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={clear}
            className="p-2 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 dark:text-neutral-500 dark:hover:text-neutral-300 dark:hover:bg-neutral-800 rounded-md transition-colors"
            title="Clear chat"
          >
            <Trash2 size={18} />
          </button>
          <button
            onClick={onClose}
            className="p-2 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 dark:text-neutral-500 dark:hover:text-neutral-300 dark:hover:bg-neutral-800 rounded-md transition-colors"
          >
            <X size={18} />
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
                  ? 'bg-neutral-100 dark:bg-neutral-800/50 -mx-4 px-4 py-3 border-l-2 border-sky-500'
                  : ''
              }`}
            >
              <div className={message.role === 'user' ? 'text-neutral-900 dark:text-neutral-100' : 'text-neutral-800 dark:text-neutral-200'}>
                {message.role === 'assistant' ? (
                  content ? (
                    <Markdown>{content}</Markdown>
                  ) : isStreaming(message, index) ? (
                    <span className="flex items-center gap-2 text-neutral-400">
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
        
        {/* Loading indicator when no assistant message yet */}
        {isLoading && (messages.length === 0 || messages[messages.length - 1]?.role === 'user') && (
          <div className="text-sm">
            <div className="text-neutral-800 dark:text-neutral-200">
              <span className="flex items-center gap-2 text-neutral-400">
                <Loader2 size={14} className="animate-spin" />
                Thinking...
              </span>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="shrink-0 p-4 border-t border-neutral-200 dark:border-neutral-800">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={adapterConfig.placeholder}
            rows={1}
            disabled={isLoading}
            className="flex-1 px-4 py-2.5 bg-neutral-50 border border-neutral-300 dark:bg-neutral-800 dark:border-neutral-700 rounded-xl text-neutral-900 dark:text-neutral-100 text-sm placeholder-neutral-500 resize-none focus:outline-none focus:ring-2 focus:ring-sky-600 focus:border-transparent disabled:opacity-50"
            style={{ maxHeight: '120px' }}
          />
          <button
            type={isLoading ? 'button' : 'submit'}
            onClick={isLoading ? stop : undefined}
            disabled={!isLoading && !input.trim()}
            className="p-2.5 bg-sky-600 hover:bg-sky-500 disabled:bg-neutral-300 dark:disabled:bg-neutral-700 disabled:text-neutral-500 text-white rounded-xl transition-colors"
          >
            {isLoading ? <Square size={18} /> : <Send size={18} />}
          </button>
        </div>
      </form>
    </div>
  );
}
