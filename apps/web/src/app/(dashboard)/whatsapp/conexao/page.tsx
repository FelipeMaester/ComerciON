'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { api, ApiError } from '@/lib/api-client';
import { CarregandoFicha } from '@/components/Carregando';
import { PageHeader } from '@/components/PageHeader';

type Situacao = 'desconectado' | 'aguardando_leitura' | 'conectando' | 'conectado';

interface EstadoDaConexao {
  situacao: Situacao;
  qr?: string;
  numero?: string | null;
  conectadoEm?: string | null;
}

/**
 * De quanto em quanto tempo a tela pergunta se já leram o QR.
 *
 * Dois segundos: o QR do WhatsApp expira em torno de 20s e é trocado por
 * outro, então a tela precisa acompanhar. Só roda enquanto a página está
 * aberta esperando leitura — conectado, para.
 */
const INTERVALO = 2000;

/**
 * Conectar o WhatsApp da loja lendo um QR Code, como no WhatsApp Web.
 *
 * A alternativa oficial (Twilio/Meta) cobra por conversa e exige verificação
 * de empresa — e é onde a cobrança do sistema emperrou: conta de teste só
 * entrega para número previamente verificado.
 *
 * O aviso sobre o risco fica na tela, e em destaque, porque a decisão é da
 * loja e as consequências também: é uma API não oficial, e o número pode ser
 * bloqueado pelo WhatsApp. Esconder isso numa nota de rodapé seria decidir
 * pelo lojista.
 */
export default function ConexaoWhatsappPage() {
  const [estado, setEstado] = useState<EstadoDaConexao | null>(null);
  const [imagemDoQr, setImagemDoQr] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const relogio = useRef<ReturnType<typeof setInterval> | null>(null);

  const carregar = useCallback(async () => {
    try {
      const dados = await api.get<EstadoDaConexao>('/whatsapp/conexao');
      setEstado(dados);
      setErro(null);
      return dados;
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível ler a situação da conexão.');
      return null;
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // O QR vem como texto; quem desenha é a biblioteca, aqui no navegador.
  useEffect(() => {
    if (!estado?.qr) {
      setImagemDoQr(null);
      return;
    }
    QRCode.toDataURL(estado.qr, { width: 280, margin: 1 })
      .then(setImagemDoQr)
      .catch(() => setImagemDoQr(null));
  }, [estado?.qr]);

  // Enquanto espera a leitura, pergunta de tempos em tempos. Conectado, para:
  // ficar batendo no servidor sem motivo é o tipo de coisa que ninguém vê e
  // todo mundo paga.
  useEffect(() => {
    const esperando = estado?.situacao === 'aguardando_leitura' || estado?.situacao === 'conectando';
    if (!esperando) {
      if (relogio.current) clearInterval(relogio.current);
      return;
    }
    relogio.current = setInterval(carregar, INTERVALO);
    return () => {
      if (relogio.current) clearInterval(relogio.current);
    };
  }, [estado?.situacao, carregar]);

  async function conectar() {
    setOcupado(true);
    setErro(null);
    try {
      setEstado(await api.post<EstadoDaConexao>('/whatsapp/conexao', {}));
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível iniciar a conexão.');
    } finally {
      setOcupado(false);
    }
  }

  async function desconectar() {
    setOcupado(true);
    setErro(null);
    try {
      await api.delete('/whatsapp/conexao');
      await carregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível desconectar.');
    } finally {
      setOcupado(false);
    }
  }

  if (!estado) return <CarregandoFicha />;

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Conectar WhatsApp"
        subtitle="Use o número da própria loja para enviar as cobranças, como no WhatsApp Web."
      />

      {erro && <p className="mb-4 text-sm text-red-600 dark:text-red-400">{erro}</p>}

      <div className="card p-5">
        {estado.situacao === 'conectado' ? (
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="font-medium text-texto">Conectado</span>
            </div>
            <p className="mt-2 text-sm text-suave">
              Número <strong className="text-texto">{estado.numero ?? '—'}</strong>
              {estado.conectadoEm && ` · desde ${new Date(estado.conectadoEm).toLocaleString('pt-BR')}`}
            </p>
            <p className="mt-3 text-sm text-suave">
              As cobranças que você autorizar saem por este número. Para conferir, abra o WhatsApp no celular em
              Aparelhos conectados — o ComerciON aparece na lista.
            </p>
            <button onClick={desconectar} disabled={ocupado} className="btn-secondary mt-4">
              {ocupado ? 'Desconectando…' : 'Desconectar'}
            </button>
          </div>
        ) : estado.situacao === 'aguardando_leitura' && imagemDoQr ? (
          <div className="text-center">
            <p className="text-sm text-suave">
              No celular: <strong className="text-texto">WhatsApp → Aparelhos conectados → Conectar aparelho</strong> e
              aponte para o código.
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imagemDoQr} alt="QR Code para conectar o WhatsApp" className="mx-auto my-4 rounded-lg" />
            <p className="text-xs text-tenue">
              O código muda sozinho a cada poucos segundos — é assim mesmo. A tela avisa quando conectar.
            </p>
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-tenue" />
              <span className="font-medium text-texto">
                {estado.situacao === 'conectando' ? 'Conectando…' : 'Desconectado'}
              </span>
            </div>
            <p className="mt-2 text-sm text-suave">
              {estado.numero
                ? `A última conexão foi com o número ${estado.numero}. Leia o código de novo para reconectar.`
                : 'Nenhum número conectado. Gere o código e leia com o celular da loja.'}
            </p>
            <button onClick={conectar} disabled={ocupado} className="btn-primary mt-4">
              {ocupado ? 'Gerando código…' : 'Gerar QR Code'}
            </button>
          </div>
        )}
      </div>

      {/* Em destaque, e não em nota de rodapé: quem assume o risco é a loja, e
          para assumir precisa saber. */}
      <div className="card mt-4 border-amber-500/40 bg-amber-500/5 p-4">
        <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Antes de conectar, saiba disto</p>
        <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-suave">
          <li>
            Esta conexão usa o WhatsApp comum, por um caminho que não é oficial. O WhatsApp pode bloquear o número —
            temporária ou permanentemente. Se o WhatsApp é o canal de vendas da loja, pese isso.
          </li>
          <li>
            O caminho oficial (WhatsApp Business API) não tem esse risco, mas cobra por conversa e exige verificação da
            empresa junto à Meta.
          </li>
          <li>
            Aqui a conexão serve para ENVIAR as cobranças que você autorizar. Mensagens recebidas continuam chegando
            pelos canais de sempre.
          </li>
        </ul>
      </div>
    </div>
  );
}
