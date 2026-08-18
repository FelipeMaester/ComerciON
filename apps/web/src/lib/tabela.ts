'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

export type Direcao = 'asc' | 'desc';

export interface Ordenacao {
  coluna: string;
  direcao: Direcao;
}

/**
 * Como cada coluna é lida e ordenada.
 *
 * `valor` devolve o que a coluna significa para efeito de ordem — não o que
 * aparece na tela. É a diferença entre ordenar preço por número (10 antes de
 * 9,90 estaria errado) e por texto.
 */
export interface Coluna<T> {
  chave: string;
  titulo: string;
  /** Coluna de número: alinha à direita e ordena numericamente. */
  numerica?: boolean;
  /** Coluna que a pessoa não pode esconder, por ser a que identifica a linha. */
  fixa?: boolean;
  valor: (item: T) => string | number | null | undefined;
}

const PREFIXO = 'comercion.tabela.';

function ler<T>(chave: string, padrao: T): T {
  if (typeof window === 'undefined') return padrao;
  try {
    const cru = window.localStorage.getItem(PREFIXO + chave);
    return cru ? (JSON.parse(cru) as T) : padrao;
  } catch {
    // localStorage indisponível (aba privada, cota cheia) ou JSON de uma versão
    // anterior: o padrão da tela é sempre um estado válido.
    return padrao;
  }
}

function gravar(chave: string, valor: unknown) {
  try {
    window.localStorage.setItem(PREFIXO + chave, JSON.stringify(valor));
  } catch {
    // Não poder lembrar a preferência não pode quebrar a tela.
  }
}

/**
 * Ordenação e escolha de colunas de uma lista, lembradas por pessoa.
 *
 * Por que lembrar importa: quem trabalha no balcão ordena a lista de peças por
 * estoque uma vez e quer encontrá-la assim amanhã. Preferência que se perde a
 * cada navegação não é preferência, é um clique a mais por dia.
 *
 * Fica no localStorage, e não no servidor, pelo mesmo motivo do tema e da
 * densidade: é preferência de quem está naquela máquina, não dado da loja —
 * o balcão e o escritório podem querer arranjos diferentes.
 *
 * A ordenação acontece aqui, sobre o que já está na tela. Isso tem um limite
 * honesto: em lista paginada, ordena a página, não a base inteira. É o
 * comportamento certo para "quero ver esta tela de outro jeito" e o errado
 * para "quero as 10 peças mais caras da loja" — para isso existe Relatórios.
 */
export function useTabela<T>(nomeDaTela: string, colunas: Coluna<T>[], itens: T[], ordemInicial?: Ordenacao) {
  const [ordenacao, setOrdenacao] = useState<Ordenacao | null>(ordemInicial ?? null);
  const [escondidas, setEscondidas] = useState<string[]>([]);
  // Só depois de montar: ler localStorage durante o render do servidor daria
  // divergência de hidratação, e a tela piscaria no primeiro carregamento.
  const [carregou, setCarregou] = useState(false);

  useEffect(() => {
    setOrdenacao(ler<Ordenacao | null>(`${nomeDaTela}.ordem`, ordemInicial ?? null));
    setEscondidas(ler<string[]>(`${nomeDaTela}.escondidas`, []));
    setCarregou(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeDaTela]);

  const alternarOrdem = useCallback(
    (chave: string) => {
      setOrdenacao((atual) => {
        // Terceiro clique volta à ordem natural da tela. Sem isso, quem
        // ordenou por engano não tem como desfazer.
        const proxima: Ordenacao | null =
          atual?.coluna !== chave
            ? { coluna: chave, direcao: 'asc' }
            : atual.direcao === 'asc'
              ? { coluna: chave, direcao: 'desc' }
              : null;
        gravar(`${nomeDaTela}.ordem`, proxima);
        return proxima;
      });
    },
    [nomeDaTela],
  );

  const alternarColuna = useCallback(
    (chave: string) => {
      setEscondidas((atuais) => {
        const proximas = atuais.includes(chave) ? atuais.filter((c) => c !== chave) : [...atuais, chave];
        gravar(`${nomeDaTela}.escondidas`, proximas);
        return proximas;
      });
    },
    [nomeDaTela],
  );

  const restaurar = useCallback(() => {
    setEscondidas([]);
    setOrdenacao(ordemInicial ?? null);
    gravar(`${nomeDaTela}.escondidas`, []);
    gravar(`${nomeDaTela}.ordem`, ordemInicial ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeDaTela]);

  const visiveis = useMemo(
    () => colunas.filter((c) => c.fixa || !escondidas.includes(c.chave)),
    [colunas, escondidas],
  );

  const ordenados = useMemo(() => {
    if (!ordenacao) return itens;
    const coluna = colunas.find((c) => c.chave === ordenacao.coluna);
    if (!coluna) return itens;

    const sinal = ordenacao.direcao === 'asc' ? 1 : -1;
    return [...itens].sort((a, b) => {
      const va = coluna.valor(a);
      const vb = coluna.valor(b);

      // Vazio sempre no fim, nas duas direções: uma peça sem marca cadastrada
      // não é "a primeira em ordem alfabética", é a que falta preencher.
      const aVazio = va === null || va === undefined || va === '';
      const bVazio = vb === null || vb === undefined || vb === '';
      if (aVazio && bVazio) return 0;
      if (aVazio) return 1;
      if (bVazio) return -1;

      if (coluna.numerica) return (Number(va) - Number(vb)) * sinal;
      // `localeCompare` com pt-BR: sem isso "Ácido" vai parar depois de "Zinco".
      return String(va).localeCompare(String(vb), 'pt-BR', { numeric: true }) * sinal;
    });
  }, [itens, colunas, ordenacao]);

  return { ordenacao, alternarOrdem, visiveis, escondidas, alternarColuna, restaurar, ordenados, carregou };
}
