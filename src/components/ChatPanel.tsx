import { useRef, useEffect, useState, useCallback } from 'react';
import { Send, X, Loader2, Trash2, Square } from 'lucide-react';
import { chat, maxIterations, type StreamChunk, type AnyClientTool } from '@tanstack/ai';
import { createChatAdapter, getConfiguredModel } from '../api/openai/chatAdapter';
import type { ChatAdapterConfig, ChatEnvironment } from '../types/chat';
import { Markdown } from './Markdown';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  otherPanelOpen?: boolean;
  adapterConfig: ChatAdapterConfig;
  environment: ChatEnvironment;
  tools: AnyClientTool[];
  buildInstructions: (environment: ChatEnvironment) => string;
}

export function ChatPanel({ 
  isOpen, 
  onClose, 
  otherPanelOpen = false, 
  adapterConfig, 
  environment,
  tools,
  buildInstructions,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Track adapter changes to reset chat
  const prevAdapterIdRef = useRef(adapterConfig.id);

  // Reset chat when adapter changes
  useEffect(() => {
    if (prevAdapterIdRef.current !== adapterConfig.id) {
      setMessages([]);
      setStreamingContent('');
      prevAdapterIdRef.current = adapterConfig.id;
    }
  }, [adapterConfig.id]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userContent = input.trim();
    setInput('');
    setIsLoading(true);
    setStreamingContent('');

    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: userContent,
    };
    setMessages(prev => [...prev, userMessage]);

    try {
      const model = getConfiguredModel();
      const adapter = createChatAdapter(model);
      const instructions = buildInstructions(environment);
      
      abortControllerRef.current = new AbortController();

      // Build messages for the API
      const apiMessages = [...messages, userMessage].map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      }));

      // Use TanStack AI chat() with streaming
      const stream = chat({
        adapter,
        messages: apiMessages,
        tools,
        systemPrompts: [instructions],
        agentLoopStrategy: maxIterations(10),
        abortController: abortControllerRef.current,
      });

      let accumulatedContent = '';

      // Process the stream
      for await (const chunk of stream as AsyncIterable<StreamChunk>) {
        if (chunk.type === 'content') {
          accumulatedContent = chunk.content;
          setStreamingContent(accumulatedContent);
        }
      }

      // Add the final assistant message
      if (accumulatedContent) {
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: accumulatedContent,
        }]);
      }
      
      setStreamingContent('');
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        if (streamingContent) {
          setMessages(prev => [...prev, {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: streamingContent + '\n\n*(cancelled)*',
          }]);
        }
      } else {
        console.error('Chat error:', error);
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.',
        }]);
      }
      setStreamingContent('');
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [input, isLoading, messages, environment, tools, buildInstructions, streamingContent]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleClearChat = () => {
    setMessages([]);
    setStreamingContent('');
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
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
            onClick={handleClearChat}
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
        {messages.map((message) => (
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
                <Markdown>{message.content}</Markdown>
              ) : (
                <span className="whitespace-pre-wrap">{message.content}</span>
              )}
            </div>
          </div>
        ))}
        
        {/* Streaming content */}
        {streamingContent && (
          <div className="text-sm">
            <div className="text-neutral-800 dark:text-neutral-200">
              <Markdown>{streamingContent}</Markdown>
            </div>
          </div>
        )}
        
        {/* Loading indicator */}
        {isLoading && !streamingContent && (
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
            onClick={isLoading ? handleStop : undefined}
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
