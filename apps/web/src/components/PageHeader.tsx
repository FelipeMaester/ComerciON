/**
 * Cabeçalho de tela.
 *
 * Cada página escrevia o próprio `<h1>` com a margem que deu na cabeça —
 * `mb-4` numa, `mb-6` noutra, tamanho diferente na terceira. Concentrar aqui
 * faz as vinte telas começarem no mesmo lugar, que é metade da sensação de
 * "sistema acabado".
 *
 * `acoes` é o canto direito: o botão de criar, o filtro, o link de exportar.
 */
export function PageHeader({
  title,
  subtitle,
  acoes,
}: {
  title: string;
  subtitle?: string;
  acoes?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="titulo-pagina">{title}</h1>
        {subtitle && <p className="subtitulo mt-1">{subtitle}</p>}
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
    </div>
  );
}
