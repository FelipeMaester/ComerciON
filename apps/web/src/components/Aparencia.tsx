'use client';

import { useEffect, useState } from 'react';
import {
  aplicarPreferencias,
  lerPreferencias,
  observarTemaDoSistema,
  salvarPreferencias,
  TELAS_INICIAIS,
  type Densidade,
  type Preferencias,
  type Tema,
} from '@/lib/preferencias';
import { podeVerTela } from './Sidebar';
import { getCurrentUserRole } from '@/lib/session';
import { useAviso } from './Avisos';

/**
 * Preferências de aparência de quem está usando o sistema.
 *
 * Tudo aqui vale só para esta pessoa, neste navegador — por isso não tem botão
 * de salvar: cada escolha aplica na hora e fica guardada. Botão "Salvar" numa
 * tela onde o efeito já está visível na própria tela é cerimônia à toa.
 */
export function Aparencia() {
  const avisar = useAviso();
  const [prefs, setPrefs] = useState<Preferencias | null>(null);

  // A tela inicial escolhida aqui é para onde o login manda. Oferecer uma
  // que o papel não abre é combinar um encontro numa porta trancada — o
  // login desviaria para outra tela, e a escolha viraria letra morta.
  const [telasQuePosso, setTelasQuePosso] = useState(TELAS_INICIAIS);

  useEffect(() => {
    setPrefs(lerPreferencias());
    const papel = getCurrentUserRole();
    setTelasQuePosso(TELAS_INICIAIS.filter((t) => podeVerTela(t.valor, papel)));
  }, []);

  // Seguindo o computador, a tela precisa acompanhar a virada do sistema.
  useEffect(() => {
    if (prefs?.tema !== 'sistema') return;
    return observarTemaDoSistema(() => aplicarPreferencias(lerPreferencias()));
  }, [prefs?.tema]);

  function mudar(parcial: Partial<Preferencias>, mensagem?: string) {
    setPrefs((atual) => {
      if (!atual) return atual;
      const novo = { ...atual, ...parcial };
      salvarPreferencias(novo);
      aplicarPreferencias(novo);
      if (mensagem) avisar(mensagem);
      return novo;
    });
  }

  // Enquanto não sabemos o que está salvo, um esqueleto com a forma da seção.
  if (!prefs) {
    return (
      <fieldset className="card p-4">
        <legend className="px-1 text-sm font-medium text-texto">Aparência</legend>
        <div className="mt-3 space-y-4">
          <div className="esqueleto h-16 w-full" />
          <div className="esqueleto h-16 w-full" />
        </div>
      </fieldset>
    );
  }

  return (
    <fieldset className="card p-4">
      <legend className="px-1 text-sm font-medium text-texto">Aparência</legend>
      <p className="mt-1 text-xs text-tenue">
        Vale só para você, neste computador. Cada escolha aplica na hora.
      </p>

      <div className="mt-4 space-y-5">
        <Escolha<Tema>
          titulo="Tema"
          descricao="“Seguir o computador” acompanha o modo claro/escuro do Windows, inclusive quando ele vira sozinho ao anoitecer."
          valor={prefs.tema}
          aoEscolher={(t) => mudar({ tema: t })}
          opcoes={[
            { valor: 'sistema', rotulo: 'Seguir o computador' },
            { valor: 'claro', rotulo: 'Claro' },
            { valor: 'escuro', rotulo: 'Escuro' },
          ]}
        />

        <Escolha<Densidade>
          titulo="Densidade das listas"
          descricao="Compacta aperta a altura das linhas e cabe cerca de dez produtos a mais na mesma tela. Os botões não encolhem — alvo de clique menor atrapalha quem está com pressa no balcão."
          valor={prefs.densidade}
          aoEscolher={(d) => mudar({ densidade: d })}
          opcoes={[
            { valor: 'confortavel', rotulo: 'Confortável' },
            { valor: 'compacta', rotulo: 'Compacta' },
          ]}
        />

        <PreviaDaLista />

        <div>
          <div className="text-sm font-medium text-texto">Tela que abre ao entrar</div>
          <p className="mb-2 mt-0.5 text-xs text-tenue">
            Quem abre o sistema para vender não precisa passar pela visão geral todo dia.
          </p>
          <select
            className="input max-w-sm"
            value={prefs.telaInicial}
            onChange={(e) => mudar({ telaInicial: e.target.value }, 'Tela inicial alterada.')}
          >
            {telasQuePosso.map((tela) => (
              <option key={tela.valor} value={tela.valor}>
                {tela.rotulo} — {tela.descricao}
              </option>
            ))}
          </select>
        </div>

        <label className="flex cursor-pointer items-start gap-2.5">
          <input
            type="checkbox"
            checked={prefs.movimentoReduzido}
            onChange={(e) => mudar({ movimentoReduzido: e.target.checked })}
            className="mt-0.5 h-4 w-4 cursor-pointer accent-[rgb(var(--marca-solida))]"
          />
          <span>
            <span className="block text-sm font-medium text-texto">Reduzir animações</span>
            <span className="block text-xs text-tenue">
              Desliga as transições do painel. Útil em computador mais lento, ou para quem se incomoda
              com movimento na tela.
            </span>
          </span>
        </label>
      </div>
    </fieldset>
  );
}

/** Grupo de opções mutuamente exclusivas, no estilo de abas. */
function Escolha<T extends string>({
  titulo,
  descricao,
  valor,
  opcoes,
  aoEscolher,
}: {
  titulo: string;
  descricao: string;
  valor: T;
  opcoes: { valor: T; rotulo: string }[];
  aoEscolher: (v: T) => void;
}) {
  return (
    <div>
      <div className="text-sm font-medium text-texto">{titulo}</div>
      <p className="mb-2 mt-0.5 text-xs text-tenue">{descricao}</p>
      <div role="radiogroup" aria-label={titulo} className="flex flex-wrap gap-1.5">
        {opcoes.map((opcao) => (
          <button
            key={opcao.valor}
            type="button"
            role="radio"
            aria-checked={valor === opcao.valor}
            onClick={() => aoEscolher(opcao.valor)}
            className={`chip border ${
              valor === opcao.valor ? 'chip-ativo border-marca/30' : 'border-linha'
            }`}
          >
            {opcao.rotulo}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Três linhas de mentira, com a mesma classe da tabela de verdade.
 *
 * Existe porque a densidade é a única preferência cujo efeito não aparece
 * nesta tela: o resto do painel muda, mas aqui não há lista nenhuma para o
 * olho comparar. Sem a prévia, escolher "compacta" seria um salto no escuro.
 */
function PreviaDaLista() {
  return (
    <div className="rounded-lg border border-linha bg-realce/40 p-2">
      <div className="mb-1 px-2 text-[11px] uppercase tracking-wide text-tenue">Prévia</div>
      <div className="overflow-hidden rounded-md border border-linha bg-superficie">
        <table className="tabela">
          <thead>
            <tr>
              <th>Produto</th>
              <th className="num">Estoque</th>
              <th className="num">Preço</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Radiador Gol G5/G6</td>
              <td className="num">12</td>
              <td className="num">R$ 320,00</td>
            </tr>
            <tr>
              <td>Condensador Corolla 1.8</td>
              <td className="num">4</td>
              <td className="num">R$ 420,00</td>
            </tr>
            <tr>
              <td>Ventoinha Civic 1.8/2.0</td>
              <td className="num">0</td>
              <td className="num">R$ 340,00</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
