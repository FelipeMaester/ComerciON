'use client';

import { useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api-client';
import type { Category } from '@/lib/types';

interface Props {
  categorias: Category[];
  valor: string;
  aoEscolher: (categoriaId: string) => void;
  /** Avisa a tela para recarregar a lista depois de criar uma categoria nova. */
  aoCriar?: (nova: Category) => void;
  className?: string;
}

/**
 * Escolher a categoria da peça — e criar uma na hora, se ela não existir.
 *
 * O campo já existia no cadastro de produto, mas só listava o que estava no
 * banco, e não havia tela nenhuma para pôr algo lá. Numa loja recém-criada o
 * seletor abria com uma opção só, "Sem categoria", e era um beco: a pessoa
 * cadastrava o estoque inteiro sem classificar nada.
 *
 * Criar aqui dentro, e não só numa tela separada, é o que importa: a hora em
 * que se descobre que falta a categoria "Mangueiras" é a hora em que se está
 * cadastrando uma mangueira. Mandar a pessoa sair do formulário, criar a
 * categoria em outro lugar e voltar significa perder o que ela já digitou.
 */
export function SeletorDeCategoria({ categorias, valor, aoEscolher, aoCriar, className = 'input' }: Props) {
  const [criando, setCriando] = useState(false);
  const [nome, setNome] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const campoRef = useRef<HTMLInputElement>(null);

  async function criar() {
    const limpo = nome.trim();
    if (limpo.length < 2) {
      setErro('O nome precisa de pelo menos duas letras.');
      return;
    }

    // Já existe com esse nome? Seleciona a que existe em vez de criar uma
    // segunda igual — duas "Radiadores" na lista não ajudam ninguém, e a
    // pessoa não tem como saber qual escolher depois.
    const repetida = categorias.find((c) => c.name.trim().toLowerCase() === limpo.toLowerCase());
    if (repetida) {
      aoEscolher(repetida.id);
      encerrar();
      return;
    }

    setSalvando(true);
    setErro(null);
    try {
      const nova = await api.post<Category>('/categories', { name: limpo });
      aoCriar?.(nova);
      aoEscolher(nova.id);
      encerrar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível criar a categoria.');
    } finally {
      setSalvando(false);
    }
  }

  function encerrar() {
    setCriando(false);
    setNome('');
    setErro(null);
  }

  if (criando) {
    return (
      <div className={className.includes('col-span') ? className.replace('input', '') : undefined}>
        <div className="flex gap-1.5">
          <input
            ref={campoRef}
            autoFocus
            className="input"
            placeholder="Nome da categoria"
            value={nome}
            onChange={(e) => {
              setNome(e.target.value);
              setErro(null);
            }}
            // Enter aqui não pode enviar o formulário do produto por baixo: a
            // pessoa está criando a categoria, não terminando o cadastro.
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                criar();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                encerrar();
              }
            }}
          />
          <button type="button" onClick={criar} disabled={salvando} className="btn-primary btn-sm shrink-0">
            {salvando ? '…' : 'Criar'}
          </button>
          <button type="button" onClick={encerrar} className="btn-ghost btn-sm shrink-0">
            Cancelar
          </button>
        </div>
        {erro && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{erro}</p>}
      </div>
    );
  }

  return (
    <select
      className={className}
      value={valor}
      aria-label="Categoria"
      onChange={(e) => {
        if (e.target.value === '__nova__') {
          setCriando(true);
          return;
        }
        aoEscolher(e.target.value);
      }}
    >
      <option value="">Sem categoria</option>
      {categorias.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
      <option value="__nova__">+ Nova categoria…</option>
    </select>
  );
}
