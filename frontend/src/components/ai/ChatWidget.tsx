'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import api from '@/lib/api';
import { useChatStore } from '@/store/chat.store';

const SUGGESTIONS = [
  'Курстарым туралы айт',
  'Емтиханға қалай дайындалу керек?',
  'Соңғы нәтижелерім қандай?',
  'Сертификат алу үшін не істеу керек?',
];

export default function ChatWidget() {
  const pathname = usePathname();
  const { isOpen, isLoading, messages, courseId, toggleChat, addMessage, setLoading } =
    useChatStore();
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Hide on exam pages
  if (pathname?.startsWith('/dashboard/exam/')) return null;

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (isOpen) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      inputRef.current?.focus();
    }
  }, [isOpen, messages]);

  const send = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || isLoading) return;

    setInput('');
    addMessage({ role: 'user', content: msg });
    setLoading(true);

    const history = messages.slice(-6).map((m) => ({ role: m.role, content: m.content }));

    try {
      const { data } = await api.post<{ reply: string }>('/ai/chat', {
        message: msg,
        courseId,
        history,
      });
      addMessage({ role: 'assistant', content: data.reply });
    } catch {
      addMessage({
        role: 'assistant',
        content: 'Қате орын алды. Сәл кейін қайталаңыз.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <>
      {/* Floating button */}
      <button
        onClick={toggleChat}
        aria-label="AI Ассистент"
        className={`fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-white text-xl transition-all duration-300 ${
          isOpen
            ? 'bg-gray-700 hover:bg-gray-800 rotate-90'
            : 'bg-primary-600 hover:bg-primary-700 hover:scale-110'
        }`}
      >
        {isOpen ? '✕' : ''}
      </button>

      {/* Chat panel */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-50 w-[360px] max-h-[560px] flex flex-col bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden animate-in slide-in-from-bottom-4 duration-200">
          {/* Header */}
          <div className="bg-primary-600 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-lg">
                
              </div>
              <div>
                <p className="text-white font-semibold text-sm">ProctoLearn AI</p>
                <p className="text-primary-100 text-xs">Оқуға қатысты сұрақтарыңызға жауап беремін</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-primary-100 text-xs">Онлайн</span>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0 max-h-[360px]">
            {messages.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-4xl mb-3"></p>
                <p className="text-gray-700 font-semibold text-sm mb-1">Сәлем! Мен AI ассистентпін</p>
                <p className="text-gray-400 text-xs mb-4">Оқу процесіңізде көмектесуге дайынмын</p>
                <div className="grid grid-cols-2 gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="text-xs text-left bg-gray-50 hover:bg-primary-50 hover:text-primary-700 border border-gray-200 hover:border-primary-300 rounded-lg px-2.5 py-2 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'assistant' && (
                    <div className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center text-sm mr-2 flex-shrink-0 mt-0.5">
                      
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                      msg.role === 'user'
                        ? 'bg-primary-600 text-white rounded-br-sm'
                        : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                    }`}
                  >
                    {msg.role === 'assistant' ? (
                      <div className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      msg.content
                    )}
                    <p className={`text-[10px] mt-1 ${msg.role === 'user' ? 'text-primary-200' : 'text-gray-400'}`}>
                      {msg.timestamp.toLocaleTimeString('kk-KZ', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))
            )}

            {isLoading && (
              <div className="flex justify-start">
                <div className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center text-sm mr-2 flex-shrink-0">
                  
                </div>
                <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input area */}
          <div className="border-t border-gray-100 p-3">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Сұрағыңызды жазыңыз..."
                rows={1}
                disabled={isLoading}
                className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400 disabled:opacity-50 max-h-24 overflow-y-auto"
                style={{ minHeight: '38px' }}
              />
              <button
                onClick={() => send()}
                disabled={!input.trim() || isLoading}
                className="w-9 h-9 rounded-xl bg-primary-600 hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center flex-shrink-0 transition-colors"
                aria-label="Жіберу"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
            <p className="text-[10px] text-gray-400 text-center mt-2">
              Enter — жіберу · Shift+Enter — жол ауыстыру
            </p>
          </div>
        </div>
      )}
    </>
  );
}
