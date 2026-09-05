'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api-client';
import { useAviso } from '@/components/Avisos';
import { ConfirmacaoNaTela } from '@/components/ConfirmacaoNaTela';
import { Botao } from '@/components/Botao';
import { ErrorNotice } from '@/components/ErrorNotice';
import { Icone } from '@/components/Icone';
import { PageHeader } from '@/components/PageHeader';
import type { Category } from '@/lib/types';
import { formatarNumero } from '@/lib/format';

/**
 * As categorias das peças.
 *
 * A API já tinha o CRUD completo desde a Fase 1, mas nenhuma tela o alcançava:
 * o cadastro de produto listava categorias e não havia lugar nenhum para criar,
 * renomear ou apagar uma. Numa loja recém-criada o campo abria com uma opção
 * só, "Sem categoria", e não havia saída.
 */
export default function CategoriesPage() {
  const avisar = useAviso();
  const [categorias, setCategorias] = useState<Category[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function carregar() {
    try {
      setCategorias(await api.get<Category[]>('/categories'));
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível carregar as categorias.');
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  if (erro) return <ErrorNotice message={erro} compact={false} />;

  return (
    <div>
      <PageHeader
        title="Categorias"
        subtitle="Como as peças ficam organizadas. Uma peça pode ficar sem categoria — o campo é opcional."
      />

      <NovaCategoria
        existentes={categorias ?? []}
        aoCriar={(nova) => {
          setCategorias((atuais) => ordenar([...(atuais ?? []), { ...nova, productCount: 0 }]));
          avisar(`Categoria “${nova.name}” criada.`);
        }}
      />

      {categorias === null ? (
        <div className="card space-y-2 p-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="esqueleto h-8 w-full" />
          ))}
        </div>
      ) : categorias.length === 0 ? (
        <div className="card">
          <div className="estado-vazio">
            <Icone nome="produto" />
            <p>Nenhuma categoria ainda. Crie a primeira acima — ou direto no cadastro da peça.</p>
            <Link href="/products" className="btn-secondary btn-sm mt-1">
              Ir para Produtos
            </Link>
          </div>
        </div>
      ) : (
        <div className="card w-full overflow-x-auto">
          <table className="tabela">
            <thead>
              <tr>
                <th>Categoria</th>
                <th className="num">Peças</th>
                <th className="w-px" />
              </tr>
            </thead>
            <tbody>
              {categorias.map((categoria) => (
                <LinhaDaCategoria
                  key={categoria.id}
                  categoria={categoria}
                  aoMudar={carregar}
                  aoAvisar={avisar}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ordenar(lista: Category[]): Category[] {
  return [...lista].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

function NovaCategoria({
  existentes,
  aoCriar,
}: {
  existentes: Category[];
  aoCriar: (nova: Category) => void;
}) {
  const [nome, setNome] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const limpo = nome.trim();

    // Mesma checagem do seletor no cadastro da peça: duas categorias com o
    // mesmo nome não ajudam ninguém — depois ninguém sabe em qual classificar.
    if (existentes.some((c) => c.name.trim().toLowerCase() === limpo.toLowerCase())) {
      setErro('Já existe uma categoria com esse nome.');
      return;
    }

    setSalvando(true);
    setErro(null);
    try {
      aoCriar(await api.post<Category>('/categories', { name: limpo }));
      setNome('');
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível criar a categoria.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="card mb-5 p-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex-1 text-sm sm:max-w-sm">
          <span className="rotulo">Nova categoria</span>
          <input
            className="input"
            placeholder="ex.: Radiadores"
            value={nome}
            onChange={(e) => {
              setNome(e.target.value);
              setErro(null);
            }}
            minLength={2}
            maxLength={120}
            required
          />
        </label>
        <Botao type="submit" carregando={salvando} disabled={nome.trim().length < 2}>
          Criar
        </Botao>
      </div>
      {erro && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{erro}</p>}
    </form>
  );
}

function LinhaDaCategoria({
  categoria,
  aoMudar,
  aoAvisar,
}: {
  categoria: Category;
  aoMudar: () => void;
  aoAvisar: (texto: string) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(categoria.name);
  const [ocupado, setOcupado] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const emUso = categoria.productCount ?? 0;

  async function renomear() {
    const limpo = nome.trim();
    if (limpo === categoria.name) {
      setEditando(false);
      return;
    }
    setOcupado(true);
    setErro(null);
    try {
      // PATCH, não PUT: a rota da API é @Patch(':id'). Com PUT, o Express
      // devolvia "Cannot PUT /api/categories/…" e o nome errado ficava na tela
      // — renomear nunca funcionou desde que esta tela nasceu.
      await api.patch(`/categories/${categoria.id}`, { name: limpo });
      setEditando(false);
      aoAvisar('Categoria renomeada.');
      aoMudar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível renomear.');
    } finally {
      setOcupado(false);
    }
  }

  /**
   * Confirmação dentro da tela, e não `window.confirm`.
   *
   * O diálogo nativo pode ser suprimido pelo navegador ("impedir que esta
   * página crie mais diálogos"), e a partir daí o clique em Excluir não faz
   * absolutamente nada, sem explicação. Aconteceu no fechamento de caixa, foi
   * corrigido lá e em Vendas, e esta tela ficou para trás — junto com a de
   * Automações, onde o defeito voltou a aparecer para quem estava usando.
   *
   * O aviso continua dizendo o NÚMERO: apagar a categoria não apaga as peças,
   * elas só ficam sem classificação, em silêncio. É por ser silencioso que
   * quem clica merece saber o tamanho do estrago antes.
   */
  async function excluir() {
    setOcupado(true);
    setErro(null);
    try {
      await api.delete(`/categories/${categoria.id}`);
      setConfirmando(false);
      aoAvisar(`Categoria “${categoria.name}” excluída.`);
      aoMudar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível excluir.');
      // Fecha junto: a mensagem de erro fica atrás do diálogo, e quem
      // clicou ficaria olhando para a mesma tela sem saber o que houve.
      setConfirmando(false);
      setOcupado(false);
    }
  }

  return (
    <tr>
      <td>
        {editando ? (
          <input
            autoFocus
            className="input max-w-xs"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                renomear();
              } else if (e.key === 'Escape') {
                setNome(categoria.name);
                setEditando(false);
              }
            }}
          />
        ) : (
          categoria.name
        )}
        {erro && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{erro}</p>}
      </td>

      <td className="num">
        {emUso === 0 ? (
          <span className="text-tenue">—</span>
        ) : (
          <Link href={`/products?categoria=${categoria.id}`} className="link" title="Ver as peças desta categoria">
            {formatarNumero(emUso)}
          </Link>
        )}
      </td>

      <td>
        <div className="flex justify-end gap-1">
          {editando ? (
            <>
              <Botao pequeno carregando={ocupado} onClick={renomear}>
                Salvar
              </Botao>
              <Botao
                pequeno
                variante="ghost"
                onClick={() => {
                  setNome(categoria.name);
                  setEditando(false);
                  setErro(null);
                }}
              >
                Cancelar
              </Botao>
            </>
          ) : (
            <>
              <Botao pequeno variante="ghost" onClick={() => setEditando(true)}>
                Renomear
              </Botao>
              <Botao pequeno variante="ghost" onClick={() => setConfirmando(true)} className="hover:text-red-600">
                Excluir
              </Botao>
              {confirmando && (
                <ConfirmacaoNaTela
                  titulo={`Excluir “${categoria.name}”?`}
                  rotuloDeConfirmar="Excluir a categoria"
                  executando={ocupado}
                  aoConfirmar={excluir}
                  aoCancelar={() => setConfirmando(false)}
                >
                  {emUso > 0 ? (
                    <>
                      <strong className="text-texto">{formatarNumero(emUso)} peça(s)</strong> ficam sem categoria. As
                      peças <strong className="text-texto">não são apagadas</strong> — só perdem a classificação, e
                      isso não aparece em lugar nenhum depois.
                    </>
                  ) : (
                    <>Nenhuma peça usa esta categoria, então nada mais muda.</>
                  )}
                </ConfirmacaoNaTela>
              )}
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
