'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api-client';
import { formatarMoeda } from '@/lib/format';
import type { Paginated, Product } from '@/lib/types';

/** Quantas sugestões a lista mostra — e, portanto, quantas o teclado percorre. */
const MAXIMO_SUGERIDO = 8;

/**
 * Busca uma peça pelo nome, SKU ou código de barras.
 *
 * A busca do balcão e a da entrada de mercadoria são a mesma necessidade:
 * achar a peça digitando ou bipando. Está aqui como componente para a próxima
 * tela que precisar não copiar a terceira versão — foi copiar-e-esquecer que
 * deixou telas para trás em outras partes deste sistema.
 *
 * Como no PDV, diz quantas peças ficaram de fora quando há mais que o
 * mostrado: ver oito de quatrocentas sem aviso faz quem procura concluir que
 * a peça não existe.
 */
export function SeletorDeProduto({
  aoEscolher,
  rotulo = 'Buscar peça',
  placeholder = 'Bipe o código de barras ou busque por nome/SKU…',
}: {
  aoEscolher: (produto: Product) => void;
  rotulo?: string;
  placeholder?: string;
}) {
  const [termo, setTermo] = useState('');
  const [achados, setAchados] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [buscando, setBuscando] = useState(false);
  const campoRef = useRef<HTMLInputElement>(null);

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
    // Espera a digitação parar: sem isto sai uma consulta por tecla.
    const timer = setTimeout(() => {
      api
        .get<Paginated<Product>>(
          `/products?search=${encodeURIComponent(busca)}&onlyActive=true&pageSize=${MAXIMO_SUGERIDO}`,
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

  function escolher(produto: Product) {
    aoEscolher(produto);
    setTermo('');
    setAchados([]);
    campoRef.current?.focus();
  }

  return (
    <div className="relative">
      <label className="block text-sm">
        <span className="mb-1 block text-suave">{rotulo}</span>
        <input
          ref={campoRef}
          className="input w-full"
          value={termo}
          placeholder={placeholder}
          onChange={(e) => setTermo(e.target.value)}
        />
      </label>

      {termo.trim() && !buscando && achados.length === 0 && (
        <p className="mt-1 text-xs text-tenue">Nenhuma peça encontrada para “{termo.trim()}”.</p>
      )}

      {achados.length > 0 && (
        <ul className="card absolute z-20 mt-1 max-h-64 w-full overflow-auto shadow-flutuante">
          {achados.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => escolher(p)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-realce"
              >
                <span>
                  <span className="font-mono text-xs text-tenue">{p.sku}</span> {p.name}
                </span>
                <span className="shrink-0 text-suave">{formatarMoeda(Number(p.price))}</span>
              </button>
            </li>
          ))}
          {total > achados.length && (
            <li className="border-t border-linha px-3 py-2 text-xs text-tenue">
              Mostrando {achados.length} de {total}. Digite mais para achar a peça certa.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
