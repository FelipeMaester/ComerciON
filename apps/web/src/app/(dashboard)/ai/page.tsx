'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api-client';
import { ErrorNotice } from '@/components/ErrorNotice';
import type { AIConversation, AIMessage } from '@/lib/types';

export default function AiPage() {
  const [conversations, setConversations] = useState<AIConversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<AIConversation | null>(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadList() {
    try {
      const data = await api.get<AIConversation[]>('/ai/conversations');
      setConversations(data);
      setListError(null);
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : 'Não foi possível carregar as conversas.');
    }
  }

  useEffect(() => {
    loadList();
  }, []);

  async function openConversation(id: string) {
    setSelectedId(id);
    setError(null);
    try {
      const data = await api.get<AIConversation>(`/ai/conversations/${id}`);
      setSelected(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível abrir a conversa.');
    }
  }

  function startNewConversation() {
    setSelectedId(null);
    setSelected(null);
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = message.trim();
    if (!text) return;

    setSending(true);
    setError(null);
    // Otimista: mostra a pergunta na hora, mesmo antes da resposta chegar.
    setSelected((prev) => ({
      id: prev?.id ?? 'pending',
      title: prev?.title ?? text.slice(0, 80),
      createdAt: prev?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [...(prev?.messages ?? []), { id: 'pending', role: 'USER', content: text, toolName: null, createdAt: new Date().toISOString() }],
    }));
    setMessage('');

    try {
      const conversation = await api.post<AIConversation>('/ai/messages', { conversationId: selectedId ?? undefined, message: text });
      setSelected(conversation);
      setSelectedId(conversation.id);
      loadList();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível enviar a mensagem.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">ComerciON IA</h1>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]" style={{ height: 'calc(100vh - 180px)' }}>
        <div className="flex flex-col overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          <div className="border-b border-slate-100 dark:border-slate-800 p-3">
            <button onClick={startNewConversation} className="btn-primary w-full text-sm">
              Nova conversa
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {listError && (
              <p className="p-3 text-xs text-red-600 dark:text-red-400">{listError}</p>
            )}
            {conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => openConversation(c.id)}
                className={`block w-full border-b border-slate-100 dark:border-slate-800 px-3 py-2 text-left text-sm ${
                  selectedId === c.id ? 'bg-slate-100 dark:bg-slate-800' : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <p className="truncate text-slate-700 dark:text-slate-200">{c.title || 'Conversa sem título'}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500">{new Date(c.updatedAt).toLocaleString('pt-BR')}</p>
              </button>
            ))}
            {conversations.length === 0 && !listError && (
              <p className="p-3 text-xs text-slate-400 dark:text-slate-500">Nenhuma conversa ainda — pergunte algo pra começar.</p>
            )}
          </div>
        </div>

        <div className="flex flex-col overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {(!selected || (selected.messages ?? []).length === 0) && (
              <p className="text-sm text-slate-400 dark:text-slate-500">
                Pergunte, por exemplo: &quot;Quanto vendemos este mês?&quot;, &quot;Quais orçamentos estão parados?&quot; ou &quot;Quem é meu melhor vendedor?&quot;
              </p>
            )}
            {selected?.messages?.map((m) => <MessageBubble key={m.id} message={m} />)}
            {sending && <p className="text-xs text-slate-400 dark:text-slate-500">Pensando…</p>}
          </div>

          {error && (
            <div className="px-4">
              <ErrorNotice message={error} />
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex gap-2 border-t border-slate-100 dark:border-slate-800 p-3">
            <input
              className="input"
              placeholder="Pergunte algo sobre o seu negócio…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={sending}
            />
            <button type="submit" disabled={sending || !message.trim()} className="btn-primary shrink-0">
              {sending ? 'Enviando…' : 'Enviar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: AIMessage }) {
  if (message.role === 'TOOL') {
    return (
      <p className="text-xs text-slate-400 dark:text-slate-500">🔧 consultou {message.toolName ?? 'dados do sistema'}…</p>
    );
  }

  const isUser = message.role === 'USER';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
          isUser
            ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
            : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200'
        }`}
      >
        {message.content}
      </div>
    </div>
  );
}
