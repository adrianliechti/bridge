import { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, X, Loader2 } from 'lucide-react';
import { chat, type Message as APIMessage } from '../api/openai';
import { Markdown } from './Markdown';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

interface AIPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AIPanel({ isOpen, onClose }: AIPanelProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: 'Hello! I can help you understand and manage your Kubernetes resources. What would you like to know?',
    },
  ]);
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

  return (
    <div
      className={`fixed top-0 right-0 h-screen w-96 bg-white border-l border-gray-200 dark:bg-gray-900 dark:border-gray-800 flex flex-col transition-all duration-300 ease-in-out ${
        isOpen ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-full pointer-events-none'
      }`}
    >
      {/* Header */}
      <div className="shrink-0 h-16 px-4 flex items-center justify-between border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <Sparkles size={20} className="text-sky-400" />
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">AI Assistant</h3>
        </div>
        <button
          onClick={onClose}
          className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-500 dark:hover:text-gray-300 dark:hover:bg-gray-800 rounded-md transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`text-sm ${
              message.role === 'user'
                ? 'bg-gray-100 dark:bg-gray-800/50 -mx-4 px-4 py-3 border-l-2 border-sky-500'
                : ''
            }`}
          >
            <div className={message.role === 'user' ? 'text-gray-900 dark:text-gray-100' : 'text-gray-800 dark:text-gray-200'}>
              {message.content ? (
                message.role === 'assistant' ? (
                  <Markdown>{message.content}</Markdown>
                ) : (
                  <span className="whitespace-pre-wrap">{message.content}</span>
                )
              ) : (
                message.isStreaming && (
                  <span className="flex items-center gap-2 text-gray-400">
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
      <form onSubmit={handleSubmit} className="shrink-0 p-4 border-t border-gray-200 dark:border-gray-800">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your resources..."
            rows={1}
            disabled={isLoading}
            className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-300 dark:bg-gray-800 dark:border-gray-700 rounded-xl text-gray-900 dark:text-gray-100 text-sm placeholder-gray-500 resize-none focus:outline-none focus:ring-2 focus:ring-sky-600 focus:border-transparent disabled:opacity-50"
            style={{ maxHeight: '120px' }}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="p-2.5 bg-sky-600 hover:bg-sky-500 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-xl transition-colors"
          >
            {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </div>
      </form>
    </div>
  );
}
