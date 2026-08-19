'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api-client';
import { CarregandoLista } from '@/components/Carregando';
import { useAviso } from '@/components/Avisos';
import { ListaVazia } from '@/components/ListaVazia';
import { PageHeader } from '@/components/PageHeader';

interface CobrancaNaFila {
  id: string;
  content: string;
  createdAt: string;
  conversation: {
    phoneNumber: string;
    customer?: { id: string; name: string } | null;
  };
}

/**
 * As cobranças que o sistema escreveu e estão esperando autorização.
 *
 * É o meio-termo entre as duas pontas que não funcionam: cobrança automática
 * assusta (mensagem errada não volta) e cobrança manual não acontece (ninguém
 * para o balcão para escrever quinze mensagens). Aqui o sistema faz a parte
 * chata — descobrir quem deve, quanto, de quê, e redigir — e a pessoa faz a
 * parte que exige julgamento.
 *
 * O texto é editável antes de aprovar porque o motivo mais comum de segurar
 * uma cobrança é querer trocar uma palavra, não descartá-la.
 */
export default function CobrancasPage() {
  const avisar = useAviso();
  const [fila, setFila] = useState<CobrancaNaFila[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [textos, setTextos] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const dados = await api.get<CobrancaNaFila[]>('/whatsapp/aprovacoes');
      setFila(dados);
      setErro(null);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível carregar as cobranças.');
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function aprovar(cobranca: CobrancaNaFila) {
    setOcupado(cobranca.id);
    try {
      const resposta = await api.post<{ enviada: boolean; motivo?: string }>(
        `/whatsapp/aprovacoes/${cobranca.id}/aprovar`,
        { texto: textos[cobranca.id] },
      );
      if (resposta.enviada) {
        avisar(`Cobrança enviada para ${cobranca.conversation.customer?.name ?? cobranca.conversation.phoneNumber}.`);
      } else {
        // Não sumiu: continua na fila para tentar amanhã.
        setErro(resposta.motivo ?? 'Não foi possível enviar agora.');
      }
      await carregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível enviar a cobrança.');
    } finally {
      setOcupado(null);
    }
  }

  async function descartar(cobranca: CobrancaNaFila) {
    setOcupado(cobranca.id);
    try {
      await api.delete(`/whatsapp/aprovacoes/${cobranca.id}`);
      avisar('Cobrança descartada.');
      await carregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível descartar.');
    } finally {
      setOcupado(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Cobranças para enviar"
        subtitle="O sistema escreveu; nada sai daqui sem você autorizar."
      />

      {erro && <p className="mb-4 text-sm text-red-600 dark:text-red-400">{erro}</p>}

      {fila === null ? (
        <CarregandoLista />
      ) : fila.length === 0 ? (
        <div className="card">
          <div className="estado-vazio">
            <p className="text-sm font-medium text-texto">Nenhuma cobrança esperando</p>
            <p className="text-sm text-tenue">
              As automações de cobrança escrevem aqui quando encontram contas vencendo ou vencidas.
            </p>
            <Link href="/automations" className="btn-secondary btn-sm mt-1">
              Ver automações
            </Link>
          </div>
        </div>
      ) : (
        <ul className="space-y-3">
          {fila.map((cobranca) => (
            <li key={cobranca.id} className="card p-4">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium text-texto">
                  {cobranca.conversation.customer?.name ?? 'Cliente sem cadastro'}
                </span>
                <span className="text-xs text-tenue">
                  {cobranca.conversation.phoneNumber} · preparada em{' '}
                  {new Date(cobranca.createdAt).toLocaleString('pt-BR')}
                </span>
              </div>

              {/* Editável: o motivo mais comum de segurar uma cobrança é
                  querer trocar uma palavra, não descartá-la. */}
              <textarea
                className="input min-h-[5rem] w-full"
                value={textos[cobranca.id] ?? cobranca.content}
                onChange={(e) => setTextos((atuais) => ({ ...atuais, [cobranca.id]: e.target.value }))}
                aria-label={`Mensagem para ${cobranca.conversation.customer?.name ?? cobranca.conversation.phoneNumber}`}
              />

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => aprovar(cobranca)}
                  disabled={ocupado === cobranca.id}
                  className="btn-primary"
                >
                  {ocupado === cobranca.id ? 'Enviando…' : 'Autorizar e enviar'}
                </button>
                <button
                  onClick={() => descartar(cobranca)}
                  disabled={ocupado === cobranca.id}
                  className="btn-secondary"
                >
                  Descartar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
