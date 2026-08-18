/**
 * O lugar do conteúdo enquanto ele não chega.
 *
 * Vinte e duas telas mostravam uma linha de texto — "Carregando…" — e depois
 * despejavam a tabela inteira de uma vez. O efeito é o layout saltando na cara
 * de quem está olhando, e é o que mais faz um sistema parecer antigo: a página
 * não tem forma até ter dado.
 *
 * Aqui a forma vem primeiro. O bloco já ocupa o espaço que a lista vai ocupar,
 * então nada se move quando os dados chegam.
 *
 * Não é um componente por tela: são três formas, porque o painel só tem três
 * tipos de conteúdo — lista, formulário e ficha.
 */
export function CarregandoLista({ linhas = 6, colunas = 4 }: { linhas?: number; colunas?: number }) {
  return (
    <div className="card w-full overflow-hidden" role="status" aria-label="Carregando a lista">
      <div className="flex gap-4 border-b border-linha bg-realce px-4 py-3">
        {Array.from({ length: colunas }).map((_, i) => (
          <div key={i} className="esqueleto h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: linhas }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-linha px-4 py-3 last:border-b-0">
          {Array.from({ length: colunas }).map((__, j) => (
            <div
              key={j}
              className="esqueleto h-3.5 flex-1"
              // Larguras diferentes por coluna: barras todas iguais parecem uma
              // grade de espera, não um texto que vai aparecer ali.
              style={{ maxWidth: j === 0 ? '40%' : j === colunas - 1 ? '60%' : undefined }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Ficha de detalhe: um título, alguns campos e um bloco. */
export function CarregandoFicha() {
  return (
    <div role="status" aria-label="Carregando">
      <div className="card mb-5 space-y-3 p-4">
        <div className="esqueleto h-6 w-64" />
        <div className="esqueleto h-3 w-40" />
        <div className="grid grid-cols-2 gap-3 pt-2 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="esqueleto h-2.5 w-16" />
              <div className="esqueleto h-4 w-24" />
            </div>
          ))}
        </div>
      </div>
      <div className="card space-y-2.5 p-4">
        <div className="esqueleto h-4 w-48" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="esqueleto h-3.5 w-full" />
        ))}
      </div>
    </div>
  );
}

/** Formulário: rótulos e campos. */
export function CarregandoFormulario({ campos = 4 }: { campos?: number }) {
  return (
    <div className="card space-y-4 p-4" role="status" aria-label="Carregando">
      {Array.from({ length: campos }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <div className="esqueleto h-2.5 w-24" />
          <div className="esqueleto h-9 w-full max-w-sm" />
        </div>
      ))}
    </div>
  );
}
