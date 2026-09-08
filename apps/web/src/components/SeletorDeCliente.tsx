'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { api } from '@/lib/api-client';
import type { Customer, Paginated } from '@/lib/types';

/** Quantos nomes a lista mostra — e, portanto, quantos os olhos percorrem. */
const MAXIMO_SUGERIDO = 8;

export interface SeletorDeClienteRef {
  focus: () => void;
}

/**
 * Acha o cliente digitando, em vez de procurar numa lista.
 *
 * O PDV usava um `<select>` carregado com os 100 primeiros clientes. Medido
 * numa loja com 801 cadastrados: a lista terminava em "Auto Center Pereira
 * 82" — não passava nem do "Auto Center", e todo cliente de B a Z era
 * inalcançável. Sem nada na tela dizendo isso.
 *
 * No balcão, isso vira uma de duas coisas, as duas ruins: vender como
 * "Cliente avulso" — e aí não há fiado, nem histórico, nem vínculo com o
 * WhatsApp — ou cadastrar o cliente de novo, duplicado, quebrando o limite de
 * crédito e a ficha que ele já tinha.
 *
 * Busca por nome, TELEFONE e documento, porque a API já busca pelos três: no
 * balcão quem atende costuma ter o telefone na tela, não o nome exato como
 * foi cadastrado um dia.
 */
export const SeletorDeCliente = forwardRef<
  SeletorDeClienteRef,
  {
    valor: string;
    aoEscolher: (cliente: Customer | null) => void;
    /** Nome do cliente já escolhido, para a tela não precisar buscá-lo de novo. */
    nomeEscolhido?: string;
  }
>(function SeletorDeCliente({ valor, aoEscolher, nomeEscolhido }, ref) {
  const [termo, setTermo] = useState('');
  const [achados, setAchados] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [buscando, setBuscando] = useState(false);
  const [aberto, setAberto] = useState(false);
  const campoRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => {
      campoRef.current?.focus();
      campoRef.current?.select();
    },
  }));

  useEffect(() => {
    const busca = termo.trim();
    if (!busca) {
      setAchados([]);
      setTotal(0);
      setBuscando(false);
      return;
    }
    setBuscando(true);
    let cancelado = false;
    // Espera a digitação parar: sem isto sai uma consulta por tecla, e o
    // balcão digita rápido.
    const timer = setTimeout(() => {
      api
        .get<Paginated<Customer>>(
          `/customers?search=${encodeURIComponent(busca)}&pageSize=${MAXIMO_SUGERIDO}`,
        )
        .then((dados) => {
          if (cancelado) return;
          setAchados(dados.items);
          setTotal(dados.total);
          setBuscando(false);
        })
        .catch(() => {
          if (cancelado) return;
          setAchados([]);
          setTotal(0);
          setBuscando(false);
        });
    }, 200);
    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
  }, [termo]);

  function escolher(cliente: Customer | null) {
    aoEscolher(cliente);
    setTermo('');
    setAchados([]);
    setAberto(false);
  }

  // Com cliente escolhido, o campo vira a identificação dele — quem está no
  // balcão precisa ver de quem é a venda sem abrir nada.
  if (valor && !aberto) {
    return (
      <div className="flex items-center gap-2">
        <span className="input flex-1 truncate" aria-label="Cliente da venda">
          {nomeEscolhido || 'Cliente selecionado'}
        </span>
        <button
          type="button"
          onClick={() => {
            escolher(null);
            setAberto(true);
            setTimeout(() => campoRef.current?.focus(), 0);
          }}
          className="acao-em-celula shrink-0 text-suave hover:text-texto"
        >
          trocar
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        ref={campoRef}
        className="input w-full"
        value={termo}
        placeholder="Cliente avulso — digite nome, telefone ou CPF/CNPJ"
        aria-label="Buscar cliente"
        onFocus={() => setAberto(true)}
        onChange={(e) => setTermo(e.target.value)}
        onKeyDown={(e) => {
          // Enter com um único achado escolhe direto: no balcão, tirar a mão
          // do teclado para clicar é o que atrasa a fila.
          if (e.key === 'Enter' && achados.length === 1) {
            e.preventDefault();
            escolher(achados[0]);
          }
        }}
      />

      {termo.trim() && !buscando && achados.length === 0 && (
        <p className="mt-1 text-xs text-tenue">
          Nenhum cliente para “{termo.trim()}”. A venda sai como avulsa.
        </p>
      )}

      {achados.length > 0 && (
        <ul className="card absolute z-20 mt-1 max-h-64 w-full overflow-auto shadow-flutuante">
          {achados.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => escolher(c)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-realce"
              >
                <span className="truncate">{c.name}</span>
                <span className="shrink-0 text-xs text-tenue">{c.phone ?? c.document ?? ''}</span>
              </button>
            </li>
          ))}
          {total > achados.length && (
            <li className="border-t border-linha px-3 py-2 text-xs text-tenue">
              Mostrando {achados.length} de {total}. Digite mais para achar o certo.
            </li>
          )}
        </ul>
      )}
    </div>
  );
});
