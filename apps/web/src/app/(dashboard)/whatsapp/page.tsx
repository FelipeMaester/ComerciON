'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api-client';
import { ErrorNotice } from '@/components/ErrorNotice';
import { Pagination } from '@/components/Pagination';
import type { Conversation, ConversationStatus, Message, MessageSender, Paginated } from '@/lib/types';

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

/** Quantas mensagens a conversa mostra de uma vez. */
const POR_PAGINA = 50;

export default function WhatsappPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [pageInfo, setPageInfo] = useState<Paginated<Conversation> | null>(null);
  const [statusFilter, setStatusFilter] = useState<ConversationStatus | ''>('');
  const [busca, setBusca] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Conversation | null>(null);
  // Em ordem cronológica, como a tela mostra. A API devolve da mais recente
  // para a mais antiga (é o fim da conversa que interessa ao abrir).
  const [mensagens, setMensagens] = useState<Message[]>([]);
  const [paginaDeMensagens, setPaginaDeMensagens] = useState<Paginated<Message> | null>(null);
  const [carregandoAnteriores, setCarregandoAnteriores] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const painelDeMensagens = useRef<HTMLDivElement>(null);
  const [irAoFim, setIrAoFim] = useState(false);

  /**
   * Conversa se lê pelo fim.
   *
   * O painel abria no topo, mostrando a mensagem mais antiga — antes era a de
   * três anos atrás, agora seria a mais velha das 50 carregadas. Nos dois
   * casos, quem abre para responder tinha de rolar até embaixo primeiro.
   *
   * Num efeito, e não logo depois do await: o React ainda não pintou as linhas
   * quando a chamada volta, e `scrollHeight` de uma lista pela metade rola até
   * um fim que ainda vai crescer. A primeira versão disto usava
   * requestAnimationFrame e parava 42 px antes do fim — perto o bastante para
   * parecer certo numa olhada, o que é o pior tipo de errado.
   *
   * Só ao abrir e ao enviar: quem clicou em "ver anteriores" está subindo de
   * propósito, e jogá-lo de volta para baixo desfaria o que pediu.
   */
  useEffect(() => {
    if (!irAoFim) return;
    const painel = painelDeMensagens.current;
    if (painel) painel.scrollTop = painel.scrollHeight;
    setIrAoFim(false);
  }, [irAoFim, mensagens]);

  const loadList = useCallback(
    async (page = 1) => {
      try {
        const query = new URLSearchParams({ page: String(page) });
        if (statusFilter) query.set('status', statusFilter);
        if (busca.trim()) query.set('search', busca.trim());
        const data = await api.get<Paginated<Conversation>>(`/whatsapp/conversations?${query.toString()}`);
        setConversations(data.items);
        setPageInfo(data);
        setListError(null);
      } catch (err) {
        setListError(err instanceof ApiError ? err.message : 'Não foi possível carregar as conversas.');
      }
    },
    [statusFilter, busca],
  );

  // Espera a digitação parar antes de consultar — o filtro de situação também
  // passa por aqui, e trocar de filtro não deve disparar duas buscas.
  useEffect(() => {
    const timer = setTimeout(() => loadList(1), 250);
    return () => clearTimeout(timer);
  }, [loadList]);

  async function carregarMensagens(id: string, page = 1) {
    const dados = await api.get<Paginated<Message>>(
      `/whatsapp/conversations/${id}/messages?page=${page}&pageSize=${POR_PAGINA}`,
    );
    const emOrdem = [...dados.items].reverse();
    // Página 1 é o fim da conversa; as seguintes são o que veio antes, e
    // entram ACIMA do que já está na tela.
    setMensagens((atuais) => (page === 1 ? emOrdem : [...emOrdem, ...atuais]));
    setPaginaDeMensagens(dados);
  }

  async function openConversation(id: string) {
    setSelectedId(id);
    setError(null);
    setMensagens([]);
    setPaginaDeMensagens(null);
    const ficha = await api.get<Conversation>(`/whatsapp/conversations/${id}`);
    setSelected(ficha);
    await carregarMensagens(id, 1);
    setIrAoFim(true);
  }

  async function verAnteriores() {
    if (!selectedId || !paginaDeMensagens) return;
    setCarregandoAnteriores(true);
    try {
      await carregarMensagens(selectedId, paginaDeMensagens.page + 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar as mensagens anteriores.');
    } finally {
      setCarregandoAnteriores(false);
    }
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
      const atualizada = await api.patch<Conversation>(`/whatsapp/conversations/${selectedId}/assign`);
      setSelected((atual) => (atual ? { ...atual, ...atualizada } : atual));
      await loadList(pageInfo?.page ?? 1);
    });
  }

  async function closeConversation() {
    if (!selectedId) return;
    await withBusy(async () => {
      const atualizada = await api.patch<Conversation>(`/whatsapp/conversations/${selectedId}/close`);
      setSelected((atual) => (atual ? { ...atual, ...atualizada } : atual));
      await loadList(pageInfo?.page ?? 1);
    });
  }

  /** As duas ações que mandam mensagem devolvem a mensagem — ela entra no fim. */
  async function enviar(chamada: () => Promise<Message>) {
    await withBusy(async () => {
      const enviada = await chamada();
      setMensagens((atuais) => [...atuais, enviada]);
      setIrAoFim(true);
      await loadList(pageInfo?.page ?? 1);
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

      <div
        className={`grid grid-cols-1 gap-4 lg:grid-cols-3 ${listError ? 'pointer-events-none opacity-40' : ''}`}
        style={{ height: '65vh' }}
      >
        <div className="card flex flex-col overflow-hidden lg:col-span-1">
          <div className="space-y-2 border-b border-linha p-3">
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
            {/* Buscar é o que torna a paginação utilizável: com mil conversas,
                achar a do cliente que ligou agora não pode ser paginar até ela. */}
            <input
              className="input"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome ou telefone…"
            />
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
                      className={`shrink-0 text-xs ${c.status === 'PENDING' ? 'font-medium text-amber-700 dark:text-amber-400' : 'text-tenue'}`}
                    >
                      {STATUS_LABEL[c.status]}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-xs text-suave">{c.messages?.[0]?.content ?? '—'}</div>
                </button>
              </li>
            ))}
            {conversations.length === 0 && (
              <li className="p-6 text-center text-sm text-tenue">
                {busca.trim() || statusFilter ? 'Nenhuma conversa com esse filtro.' : 'Nenhuma conversa por aqui ainda.'}
              </li>
            )}
          </ul>
          <div className="border-t border-linha px-3 pb-2">
            <Pagination data={pageInfo} onPageChange={(p) => loadList(p)} itemLabel="conversas" />
          </div>
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
                  <button
                    onClick={() =>
                      enviar(() => api.post<Message>(`/whatsapp/conversations/${selectedId}/send-catalog`))
                    }
                    disabled={busy}
                    className="btn-secondary text-xs"
                  >
                    Enviar catálogo
                  </button>
                  <button onClick={assignToMe} disabled={busy} className="btn-secondary text-xs">
                    Assumir
                  </button>
                  <button
                    onClick={closeConversation}
                    disabled={busy || selected.status === 'CLOSED'}
                    className="btn-secondary text-xs"
                  >
                    Encerrar
                  </button>
                </div>
              </div>

              {/* role="log": é uma transcrição que cresce por baixo, e é assim
                  que o leitor de tela anuncia a mensagem nova sem reler tudo. */}
              <div
                ref={painelDeMensagens}
                role="log"
                aria-label="Mensagens da conversa"
                className="flex-1 space-y-3 overflow-y-auto p-4"
              >
                {paginaDeMensagens && paginaDeMensagens.page < paginaDeMensagens.totalPages && (
                  <div className="text-center">
                    <button
                      onClick={verAnteriores}
                      disabled={carregandoAnteriores}
                      className="btn-secondary text-xs disabled:opacity-50"
                    >
                      {carregandoAnteriores
                        ? 'Carregando…'
                        : `Ver mensagens anteriores (${paginaDeMensagens.total - mensagens.length} antes desta)`}
                    </button>
                  </div>
                )}
                {mensagens.map((m) => (
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
                      if (e.key === 'Enter' && replyText.trim() && !busy) {
                        const texto = replyText;
                        setReplyText('');
                        enviar(() =>
                          api.post<Message>(`/whatsapp/conversations/${selectedId}/reply`, { text: texto }),
                        );
                      }
                    }}
                  />
                  <button
                    onClick={() => {
                      const texto = replyText;
                      setReplyText('');
                      enviar(() => api.post<Message>(`/whatsapp/conversations/${selectedId}/reply`, { text: texto }));
                    }}
                    disabled={busy || !replyText.trim()}
                    className="btn-primary shrink-0"
                  >
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
