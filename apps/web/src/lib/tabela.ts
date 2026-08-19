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
  /**
   * O banco sabe ordenar por esta coluna.
   *
   * Marcada, a ordem é pedida ao servidor e vale para a lista inteira. Sem
   * marca, a tela ordena o que tem em mãos — o que em lista paginada é só a
   * página, e a tela diz isso. Fica na definição da coluna porque é aqui que
   * se olha ao acrescentar uma: esquecer a marca degrada para o comportamento
   * antigo, que é honesto; marcar uma coluna que a API não aceita faz a API
   * cair no padrão dela, e a ordem visível não seria a pedida.
   */
  noServidor?: boolean;
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
 * A ordenação vai ao servidor nas colunas marcadas com `noServidor`, e aí
 * vale para a base inteira: pedir as peças mais caras traz as mais caras da
 * loja, não as mais caras das 25 que estavam carregadas. Nas outras — as que
 * dependem de conta feita depois da consulta, como o saldo de estoque — a
 * ordem continua sendo da página, e a tela avisa em vez de deixar parecer.
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

  /**
   * Aplica a ordem escolhida a QUALQUER lista, não só à que está na tela.
   *
   * É o que faz o CSV sair na mesma ordem que a pessoa vê depois de buscar
   * todas as páginas — sem isto, o arquivo chegaria na ordem do servidor e a
   * ordenação da tela viraria mentira no papel.
   */
  const colunaOrdenada = useMemo(
    () => (ordenacao ? (colunas.find((c) => c.chave === ordenacao.coluna) ?? null) : null),
    [colunas, ordenacao],
  );

  /**
   * A ordenação a mandar para a API — nula quando quem ordena é a tela.
   *
   * Coluna sem `noServidor` não vai no pedido de propósito: mandar um nome
   * que a API não conhece faria ela cair no padrão dela, e a lista voltaria
   * numa ordem que não é nem a pedida nem a natural.
   */
  const ordenacaoNoServidor = colunaOrdenada?.noServidor ? ordenacao : null;

  /** Está ordenando só o que já chegou — é o caso que precisa de aviso. */
  const ordenandoNoCliente = Boolean(colunaOrdenada && !colunaOrdenada.noServidor);

  const ordenarLista = useCallback(
    (lista: T[]): T[] => {
      if (!ordenacao) return lista;
      const coluna = colunas.find((c) => c.chave === ordenacao.coluna);
      // Já veio ordenada do banco: reordenar aqui daria no mesmo em texto, mas
      // não em número — a tela compara o que exibe, e "R$ 1.000,00" antes de
      // "R$ 90,00" é exatamente o erro que a ordenação no banco corrige.
      if (!coluna || coluna.noServidor) return lista;
      const sinal = ordenacao.direcao === 'asc' ? 1 : -1;
      return [...lista].sort((a, b) => compararPorColuna(coluna, a, b, sinal));
    },
    [colunas, ordenacao],
  );

  const ordenados = useMemo(() => {
    if (!ordenacao) return itens;
    const coluna = colunas.find((c) => c.chave === ordenacao.coluna);
    // Mesmo motivo do ordenarLista: o banco já entregou na ordem certa.
    if (!coluna || coluna.noServidor) return itens;

    const sinal = ordenacao.direcao === 'asc' ? 1 : -1;
    return [...itens].sort((a, b) => compararPorColuna(coluna, a, b, sinal));
  }, [itens, colunas, ordenacao]);

  return {
    ordenacao,
    ordenacaoNoServidor,
    ordenandoNoCliente,
    alternarOrdem,
    visiveis,
    escondidas,
    alternarColuna,
    restaurar,
    ordenados,
    ordenarLista,
    carregou,
  };
}

/** A comparação de duas linhas por uma coluna. Uma só, para tela e CSV nunca discordarem. */
function compararPorColuna<T>(coluna: Coluna<T>, a: T, b: T, sinal: number): number {
  const va = coluna.valor(a);
  const vb = coluna.valor(b);

  // Vazio sempre no fim, nas duas direções: uma peça sem marca cadastrada não
  // é "a primeira em ordem alfabética", é a que falta preencher.
  const aVazio = va === null || va === undefined || va === '';
  const bVazio = vb === null || vb === undefined || vb === '';
  if (aVazio && bVazio) return 0;
  if (aVazio) return 1;
  if (bVazio) return -1;

  if (coluna.numerica) return (Number(va) - Number(vb)) * sinal;
  // `localeCompare` com pt-BR: sem isso "Ácido" vai parar depois de "Zinco".
  return String(va).localeCompare(String(vb), 'pt-BR', { numeric: true }) * sinal;
}

/**
 * Busca todas as páginas de uma lista paginada.
 *
 * Existe para o CSV poder entregar a lista inteira sem que cada tela repita
 * este laço. Usa o maior tamanho de página que a API aceita (100), então um
 * catálogo de 800 peças sai em oito idas ao servidor.
 *
 * O teto de páginas não é desconfiança da API: é o que impede um laço infinito
 * caso um dia ela passe a responder `totalPages` inconsistente — sem ele, o
 * navegador travaria em silêncio no meio de um download.
 */
export async function buscarTodasAsPaginas<T>(
  buscarPagina: (pagina: number, tamanho: number) => Promise<{ items: T[]; totalPages: number }>,
): Promise<T[]> {
  const TAMANHO = 100;
  const TETO_DE_PAGINAS = 200;

  const primeira = await buscarPagina(1, TAMANHO);
  const itens = [...primeira.items];
  const paginas = Math.min(primeira.totalPages, TETO_DE_PAGINAS);

  for (let pagina = 2; pagina <= paginas; pagina++) {
    const seguinte = await buscarPagina(pagina, TAMANHO);
    itens.push(...seguinte.items);
  }
  return itens;
}

/**
 * Acrescenta a ordenação ao pedido da listagem.
 *
 * Recebe a ordenação já filtrada pelo hook (`ordenacaoNoServidor`), que é nula
 * quando quem ordena é a tela — assim nenhuma página precisa decidir sozinha
 * se manda ou não, que é onde as três telas divergiriam com o tempo.
 */
export function comOrdenacao(params: URLSearchParams, ordenacao: Ordenacao | null): URLSearchParams {
  if (ordenacao) {
    params.set('ordenarPor', ordenacao.coluna);
    params.set('direcao', ordenacao.direcao);
  }
  return params;
}
