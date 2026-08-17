'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api-client';
import { ErrorNotice } from '@/components/ErrorNotice';
import type { Conversation, ConversationStatus, MessageSender } from '@/lib/types';

const STATUS_LABEL: Record<ConversationStatus, string> = {
  OPEN: 'Em atendimento',
  PENDING: 'Aguardando atendente',
  CLOSED: 'Encerrada',
};

const SENDER_LABEL: Record<MessageSender, string> = {
  CUSTOMER: 'Cliente',
  BOT: 'Bot',
  AGENT: 'Atendente',
  SYSTEM: 'Automático',
};

export default function WhatsappPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [statusFilter, setStatusFilter] = useState<ConversationStatus | ''>('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [replyText, setReplyText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  async function loadList() {
    const query = statusFilter ? `?status=${statusFilter}` : '';
    try {
      const data = await api.get<Conversation[]>(`/whatsapp/conversations${query}`);
      setConversations(data);
      setListError(null);
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : 'Não foi possível carregar as conversas.');
    }
  }

  useEffect(() => {
    loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  async function openConversation(id: string) {
    setSelectedId(id);
    setError(null);
    const data = await api.get<Conversation>(`/whatsapp/conversations/${id}`);
    setSelected(data);
  }

  async function withBusy(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível completar a ação.');
    } finally {
      setBusy(false);
    }
  }

  async function assignToMe() {
    if (!selectedId) return;
    await withBusy(async () => {
      await api.patch(`/whatsapp/conversations/${selectedId}/assign`);
      await openConversation(selectedId);
      await loadList();
    });
  }

  async function closeConversation() {
    if (!selectedId) return;
    await withBusy(async () => {
      await api.patch(`/whatsapp/conversations/${selectedId}/close`);
      await openConversation(selectedId);
      await loadList();
    });
  }

  async function sendCatalog() {
    if (!selectedId) return;
    await withBusy(async () => {
      await api.post(`/whatsapp/conversations/${selectedId}/send-catalog`);
      await openConversation(selectedId);
      await loadList();
    });
  }

  async function sendReply() {
    if (!selectedId || !replyText.trim()) return;
    await withBusy(async () => {
      await api.post(`/whatsapp/conversations/${selectedId}/reply`, { text: replyText });
      setReplyText('');
      await openConversation(selectedId);
      await loadList();
    });
  }

  return (
    <div>
      <h1 className="mb-2 titulo-pagina">Atendimento via WhatsApp</h1>
      <p className="mb-6 text-sm text-suave">
        Inbox de conversas — o chatbot responde perguntas frequentes automaticamente; quando não sabe responder, a
        conversa fica &quot;aguardando atendente&quot; até alguém assumir.
      </p>

      {listError && (
        <div className="mb-6">
          <ErrorNotice message={listError} compact={false} />
        </div>
      )}

      <div className={`grid grid-cols-1 gap-4 lg:grid-cols-3 ${listError ? 'pointer-events-none opacity-40' : ''}`} style={{ height: '65vh' }}>
        <div className="card flex flex-col overflow-hidden lg:col-span-1">
          <div className="border-b border-linha p-3">
            <select
              className="input"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as ConversationStatus | '')}
            >
              <option value="">Todas as conversas</option>
              <option value="PENDING">Aguardando atendente</option>
              <option value="OPEN">Em atendimento</option>
              <option value="CLOSED">Encerradas</option>
            </select>
          </div>
          <ul className="flex-1 divide-y divide-linha overflow-y-auto">
            {conversations.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => openConversation(c.id)}
                  className={`block w-full px-4 py-3 text-left text-sm hover:bg-realce ${
                    selectedId === c.id ? 'bg-realce' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{c.customer?.name ?? c.phoneNumber}</span>
                    <span
                      className={`shrink-0 text-xs ${c.status === 'PENDING' ? 'font-medium text-amber-600 dark:text-amber-400' : 'text-tenue'}`}
                    >
                      {STATUS_LABEL[c.status]}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-xs text-suave">{c.messages?.[0]?.content ?? '—'}</div>
                </button>
              </li>
            ))}
            {conversations.length === 0 && (
              <li className="p-6 text-center text-sm text-tenue">Nenhuma conversa por aqui ainda.</li>
            )}
          </ul>
        </div>

        <div className="card flex flex-col overflow-hidden lg:col-span-2">
          {!selected ? (
            <p className="p-6 text-sm text-suave">Selecione uma conversa à esquerda.</p>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-linha p-4">
                <div>
                  <div className="font-medium">{selected.customer?.name ?? selected.phoneNumber}</div>
                  <div className="text-xs text-tenue">
                    {selected.phoneNumber} — {STATUS_LABEL[selected.status]}
                    {selected.assignedUser ? ` — atendido por ${selected.assignedUser.name}` : ''}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button onClick={sendCatalog} disabled={busy} className="btn-secondary text-xs">
                    Enviar catálogo
                  </button>
                  <button onClick={assignToMe} disabled={busy} className="btn-secondary text-xs">
                    Assumir
                  </button>
                  <button onClick={closeConversation} disabled={busy || selected.status === 'CLOSED'} className="btn-secondary text-xs">
                    Encerrar
                  </button>
                </div>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {selected.messages?.map((m) => (
                  <div
                    key={m.id}
                    className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                      m.direction === 'INBOUND' ? 'bg-realce' : 'ml-auto bg-emerald-50 dark:bg-emerald-950'
                    }`}
                  >
                    <div className="mb-1 text-[10px] uppercase tracking-wide text-tenue">{SENDER_LABEL[m.sender]}</div>
                    {m.content}
                  </div>
                ))}
              </div>

              <div className="border-t border-linha p-4">
                {error && (
                  <div className="mb-2">
                    <ErrorNotice message={error} />
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    className="input"
                    placeholder="Responder ao cliente…"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') sendReply();
                    }}
                  />
                  <button onClick={sendReply} disabled={busy || !replyText.trim()} className="btn-primary shrink-0">
                    Enviar
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
