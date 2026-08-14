'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot, X, Send, Trash2, MessageSquare, Sparkles,
  ChevronDown, ChevronUp, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Conversation {
  id: string;
  messages: string;
  createdAt: string;
}

function authFetch(url: string, options: RequestInit = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('rtr_token') : null;
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
}

// Simple markdown-like rendering
function renderContent(content: string) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let inTable = false;
  let tableRows: string[][] = [];
  let isHeaderRow = true;

  const processTable = () => {
    if (tableRows.length === 0) return;
    elements.push(
      <div key={`table-${elements.length}`} className="my-3 overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-slate-100">
              {tableRows[0]?.map((cell, i) => (
                <th key={i} className="border border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">{cell}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableRows.slice(1).map((row, ri) => (
              <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                {row.map((cell, ci) => (
                  <td key={ci} className="border border-slate-200 px-3 py-2 text-slate-600">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
    tableRows = [];
    isHeaderRow = true;
  };

  lines.forEach((line, idx) => {
    const trimmed = line.trim();

    // Table detection
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      if (!inTable) {
        inTable = true;
        tableRows = [];
        isHeaderRow = true;
      }
      if (trimmed.replace(/[|\-\s]/g, '') === '') return; // separator row
      const cells = trimmed.split('|').filter(c => c.trim() !== '').map(c => c.trim());
      if (isHeaderRow) {
        tableRows.push(cells);
        isHeaderRow = false;
      } else {
        tableRows.push(cells);
      }
      return;
    } else if (inTable) {
      inTable = false;
      processTable();
    }

    if (!trimmed) {
      elements.push(<br key={`br-${idx}`} />);
      return;
    }

    // Headers
    if (trimmed.startsWith('### ')) {
      elements.push(<h4 key={idx} className="font-bold text-slate-800 mt-3 mb-1">{trimmed.slice(4)}</h4>);
      return;
    }
    if (trimmed.startsWith('## ')) {
      elements.push(<h3 key={idx} className="font-bold text-slate-800 mt-4 mb-2 text-sm">{trimmed.slice(3)}</h3>);
      return;
    }
    if (trimmed.startsWith('# ')) {
      elements.push(<h2 key={idx} className="font-bold text-slate-800 mt-4 mb-2">{trimmed.slice(2)}</h2>);
      return;
    }

    // Bullet points
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      elements.push(
        <div key={idx} className="flex gap-2 ml-2 my-0.5">
          <span className="text-emerald-500 mt-0.5">•</span>
          <span className="text-slate-700 text-sm">{renderInlineBold(trimmed.slice(2))}</span>
        </div>
      );
      return;
    }

    // Numbered list
    const numMatch = trimmed.match(/^(\d+)\.\s(.+)/);
    if (numMatch) {
      elements.push(
        <div key={idx} className="flex gap-2 ml-2 my-0.5">
          <span className="text-emerald-600 font-semibold text-sm min-w-[1.2rem]">{numMatch[1]}.</span>
          <span className="text-slate-700 text-sm">{renderInlineBold(numMatch[2])}</span>
        </div>
      );
      return;
    }

    // Regular paragraph
    elements.push(<p key={idx} className="text-sm text-slate-700 leading-relaxed my-1">{renderInlineBold(trimmed)}</p>);
  });

  if (inTable) processTable();
  return elements;
}

function renderInlineBold(text: string) {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold text-slate-900">{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

// ────────────────────────────────────────
// Quick Action Buttons
// ────────────────────────────────────────

const QUICK_ACTIONS = [
  { label: 'Fleet Overview', message: 'Give me a fleet overview' },
  { label: 'Open Alerts', message: 'Show me open alerts' },
  { label: 'Driver Ranking', message: 'Show driver performance ranking' },
  { label: 'Maintenance Due', message: 'What maintenance is due?' },
  { label: 'Today Trips', message: 'Show today trip summary' },
  { label: 'UAE Compliance', message: 'What are UAE fleet compliance requirements?' },
];

// ────────────────────────────────────────
// Main Component
// ────────────────────────────────────────

export default function AIChatPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [open]);

  // Load conversations on open
  const loadConversations = useCallback(async () => {
    try {
      const res = await authFetch('/api/ai/chat');
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    if (open) loadConversations();
  }, [open, loadConversations]);

  const sendMessage = async (text?: string) => {
    const msg = text || input.trim();
    if (!msg || loading) return;

    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: msg }]);
    setLoading(true);

    try {
      const res = await authFetch('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({ message: msg, conversationId }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'AI request failed'); setLoading(false); return; }
      setMessages(data.messages || []);
      if (data.conversationId) setConversationId(data.conversationId);
      // Refresh history
      loadConversations();
    } catch {
      toast.error('Network error');
    } finally {
      setLoading(false);
    }
  };

  const loadConversation = async (id: string) => {
    try {
      const res = await authFetch(`/api/ai/conversations/${id}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
        setConversationId(id);
        setShowHistory(false);
      }
    } catch { toast.error('Failed to load conversation'); }
  };

  const deleteConversation = async (id: string) => {
    try {
      const res = await authFetch(`/api/ai/conversations/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setConversations(prev => prev.filter(c => c.id !== id));
        if (conversationId === id) {
          setMessages([]);
          setConversationId(null);
        }
        toast.success('Conversation deleted');
      }
    } catch { toast.error('Failed to delete'); }
  };

  const startNew = () => {
    setMessages([]);
    setConversationId(null);
    setShowHistory(false);
    setInput('');
  };

  const getConversationTitle = (conv: Conversation) => {
    try {
      const msgs: Message[] = JSON.parse(conv.messages);
      const first = msgs.find(m => m.role === 'user');
      return first ? first.content.slice(0, 40) + (first.content.length > 40 ? '...' : '') : 'New Chat';
    } catch {
      return 'New Chat';
    }
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ x: 400, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 400, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 250 }}
          className="fixed right-0 top-0 h-full w-full sm:w-[420px] bg-white border-l border-slate-200 shadow-2xl z-50 flex flex-col"
        >
          {/* Header */}
          <div className="h-16 border-b border-slate-200 flex items-center justify-between px-4 shrink-0 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm">Fleet AI Assistant</h3>
                <p className="text-[11px] text-emerald-100">Powered by Mianx.ai</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/10"
                onClick={() => setShowHistory(!showHistory)}
              >
                <MessageSquare className="w-4 h-4" />
              </Button>
              {messages.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/10"
                  onClick={startNew}
                >
                  <Sparkles className="w-4 h-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/10"
                onClick={onClose}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Conversation History Panel */}
          <AnimatePresence>
            {showHistory && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden border-b border-slate-200"
              >
                <div className="p-3 bg-slate-50">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 px-1">Recent Chats</h4>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {conversations.length === 0 ? (
                      <p className="text-xs text-slate-400 px-1 py-3 text-center">No conversations yet</p>
                    ) : (
                      conversations.map(conv => (
                        <div
                          key={conv.id}
                          className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors group ${
                            conversationId === conv.id ? 'bg-emerald-100 text-emerald-800' : 'hover:bg-slate-100 text-slate-600'
                          }`}
                          onClick={() => loadConversation(conv.id)}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{getConversationTitle(conv)}</p>
                            <p className="text-[10px] text-slate-400">{timeAgo(conv.createdAt)}</p>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}
                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 rounded transition-all"
                          >
                            <Trash2 className="w-3 h-3 text-red-400" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-6">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-100 to-emerald-200 flex items-center justify-center mb-4">
                  <Bot className="w-8 h-8 text-emerald-600" />
                </div>
                <h3 className="font-bold text-slate-800 mb-1">Fleet AI Assistant</h3>
                <p className="text-sm text-slate-500 text-center mb-6 max-w-[280px]">
                  Ask anything about your fleet — vehicles, drivers, alerts, maintenance, compliance.
                </p>
                <div className="grid grid-cols-2 gap-2 w-full max-w-[320px]">
                  {QUICK_ACTIONS.map((qa) => (
                    <button
                      key={qa.label}
                      onClick={() => sendMessage(qa.message)}
                      className="text-xs px-3 py-2.5 rounded-lg border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 transition-colors text-left cursor-pointer"
                    >
                      {qa.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-4 space-y-4">
                {messages.map((msg, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    {msg.role === 'assistant' && (
                      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shrink-0 mt-0.5">
                        <Bot className="w-4 h-4 text-white" />
                      </div>
                    )}
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                        msg.role === 'user'
                          ? 'bg-emerald-600 text-white rounded-br-md'
                          : 'bg-slate-100 text-slate-800 rounded-bl-md'
                      }`}
                    >
                      {msg.role === 'assistant' ? (
                        <div className="prose-sm">{renderContent(msg.content)}</div>
                      ) : (
                        <p className="text-sm">{msg.content}</p>
                      )}
                    </div>
                    {msg.role === 'user' && (
                      <div className="w-7 h-7 rounded-lg bg-slate-200 flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-bold text-slate-500">
                        U
                      </div>
                    )}
                  </motion.div>
                ))}
                {loading && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex gap-3 items-start"
                  >
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shrink-0">
                      <Bot className="w-4 h-4 text-white" />
                    </div>
                    <div className="bg-slate-100 rounded-2xl rounded-bl-md px-4 py-3">
                      <div className="flex items-center gap-2 text-slate-400">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-xs">Analyzing fleet data...</span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-slate-200 p-3 shrink-0 bg-white">
            <form
              onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
              className="flex items-center gap-2"
            >
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about your fleet..."
                className="flex-1 h-10 rounded-xl border-slate-200 focus:border-emerald-400"
                disabled={loading}
              />
              <Button
                type="submit"
                size="icon"
                className="h-10 w-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
                disabled={!input.trim() || loading}
              >
                <Send className="w-4 h-4" />
              </Button>
            </form>
            <p className="text-[10px] text-slate-400 mt-2 text-center">
              Powered by Mianx.ai Intelligence Engine
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
