import { useState, useRef, useEffect } from 'react';
import { Send, X, Loader2, Trash2 } from 'lucide-react';
import { chat, type ChatContext } from '../api/kubernetesChat';
import type { Message as APIMessage } from '../api/openai';
import { Markdown } from './Markdown';
import { getConfig } from '../config';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

interface AIPanelProps {
  isOpen: boolean;
  onClose: () => void;
  otherPanelOpen?: boolean;
  context?: ChatContext;
}

export function AIPanel({ isOpen, onClose, otherPanelOpen = false, context }: AIPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationHistory, setConversationHistory] = useState<APIMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
    };

    const assistantMessageId = (Date.now() + 1).toString();
    
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // Add streaming placeholder message
    setMessages((prev) => [
      ...prev,
      {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        isStreaming: true,
      },
    ]);

    try {
      const { response, history } = await chat(
        userMessage.content,
        conversationHistory,
        {
          model: getConfig().ai?.model || '',
          context,
          onStream: (_delta, snapshot) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessageId
                  ? { ...m, content: snapshot }
                  : m
              )
            );
          },
          onToolCall: (toolName, args) => {
            console.log('Tool call:', toolName, args);
          },
        }
      );

      // Update conversation history for context
      setConversationHistory(history);

      // Finalize the assistant message
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMessageId
            ? { ...m, content: response.content, isStreaming: false }
            : m
        )
      );
    } catch (error) {
      console.error('Chat error:', error);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMessageId
            ? {
                ...m,
                content: 'Sorry, I encountered an error. Please try again.',
                isStreaming: false,
              }
            : m
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleClearChat = () => {
    setMessages([]);
    setConversationHistory([]);
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
        <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">AI Assistant</h3>
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
              {message.content ? (
                message.role === 'assistant' ? (
                  <Markdown>{message.content}</Markdown>
                ) : (
                  <span className="whitespace-pre-wrap">{message.content}</span>
                )
              ) : (
                message.isStreaming && (
                  <span className="flex items-center gap-2 text-neutral-400">
                    <Loader2 size={14} className="animate-spin" />
                    Thinking...
                  </span>
                )
              )}
            </div>
          </div>
        ))}
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
            placeholder="Ask about your resources..."
            rows={1}
            disabled={isLoading}
            className="flex-1 px-4 py-2.5 bg-neutral-50 border border-neutral-300 dark:bg-neutral-800 dark:border-neutral-700 rounded-xl text-neutral-900 dark:text-neutral-100 text-sm placeholder-neutral-500 resize-none focus:outline-none focus:ring-2 focus:ring-sky-600 focus:border-transparent disabled:opacity-50"
            style={{ maxHeight: '120px' }}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="p-2.5 bg-sky-600 hover:bg-sky-500 disabled:bg-neutral-300 dark:disabled:bg-neutral-700 disabled:text-neutral-500 text-white rounded-xl transition-colors"
          >
            {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </div>
      </form>
    </div>
  );
}
