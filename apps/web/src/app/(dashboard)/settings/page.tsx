'use client';

import { ChangeEvent, FormEvent, PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api-client';
import { CarregandoLista } from '@/components/Carregando';
import { CORES_SUGERIDAS, diagnosticoDaCor } from '@/lib/marca';
import type { BrandDisplay, TenantSettings } from '@/lib/types';

const DEFAULT_COLOR = '#0f172a';

/**
 * As três formas da identidade, na ordem em que fazem sentido escolher.
 *
 * A descrição diz PARA QUEM a opção serve, não o que ela faz — "só a logo" é
 * óbvio, o difícil é saber que ela existe para quem tem logotipo com o nome
 * escrito dentro. Sem isso, ninguém sai de "logo e nome".
 */
const IDENTIDADES: { valor: BrandDisplay; titulo: string; descricao: string }[] = [
  { valor: 'logo_e_nome', titulo: 'Logo e nome', descricao: 'Para logo que é só um símbolo.' },
  { valor: 'logo', titulo: 'Só a logo', descricao: 'Para logotipo que já traz o nome escrito.' },
  { valor: 'nome', titulo: 'Só o nome', descricao: 'Para quem não tem arquivo de logo.' },
];
const INSTALLMENT_COUNTS = Array.from({ length: 12 }, (_, i) => i + 1);
// Mesmo teto (em bytes, antes de virar base64) usado como referência pelo
// backend — falhar aqui é mais rápido para o usuário do que esperar o PATCH
// voltar com 400.
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

interface Position {
  x: number;
  y: number;
}

const CENTER: Position = { x: 50, y: 50 };

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function parsePosition(value: string | null): Position {
  const match = value?.match(/^(\d{1,3})% (\d{1,3})%$/);
  if (!match) return CENTER;
  return { x: clamp(Number(match[1]), 0, 100), y: clamp(Number(match[2]), 0, 100) };
}

function formatPosition(pos: Position): string {
  return `${Math.round(pos.x)}% ${Math.round(pos.y)}%`;
}

function readImageAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Frame com a imagem recortada (object-cover) que o usuário arrasta para
 * escolher qual parte fica visível — como o reposicionamento de foto de capa
 * do Facebook. Sem redimensionar nada: só desloca o object-position dentro
 * do próprio elemento, então não precisa de canvas/crop real no servidor.
 */
function DraggableImage({
  src,
  position,
  onPositionChange,
  className,
}: {
  src: string;
  position: Position;
  onPositionChange: (pos: Position) => void;
  className: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ pointerX: number; pointerY: number; pos: Position } | null>(null);

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStart.current = { pointerX: e.clientX, pointerY: e.clientY, pos: position };
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragStart.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const deltaXPct = ((e.clientX - dragStart.current.pointerX) / rect.width) * 100;
    const deltaYPct = ((e.clientY - dragStart.current.pointerY) / rect.height) * 100;
    onPositionChange({
      x: clamp(dragStart.current.pos.x - deltaXPct, 0, 100),
      y: clamp(dragStart.current.pos.y - deltaYPct, 0, 100),
    });
  }

  function handlePointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    dragStart.current = null;
  }

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className={`${className} relative select-none overflow-hidden [touch-action:none] active:cursor-grabbing`}
      style={{ cursor: 'grab' }}
    >
      <img
        src={src}
        alt=""
        draggable={false}
        className="h-full w-full object-cover"
        style={{ objectPosition: `${position.x}% ${position.y}%` }}
      />
    </div>
  );
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [name, setName] = useState('');
  const [document, setDocument] = useState('');
  const [phone, setPhone] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [primaryColor, setPrimaryColor] = useState(DEFAULT_COLOR);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoPosition, setLogoPosition] = useState<Position>(CENTER);
  const [brandDisplay, setBrandDisplay] = useState<BrandDisplay>('logo_e_nome');
  const [cardFeeRates, setCardFeeRates] = useState<number[]>(Array(12).fill(0));

  useEffect(() => {
    api
      .get<TenantSettings>('/settings')
      .then((data) => {
        setName(data.name);
        setDocument(data.document ?? '');
        setPhone(data.phone ?? '');
        setAddressLine(data.addressLine ?? '');
        setPrimaryColor(data.primaryColor ?? DEFAULT_COLOR);
        setLogoUrl(data.logoUrl);
        setLogoPosition(parsePosition(data.logoPosition));
        setBrandDisplay(data.brandDisplay ?? 'logo_e_nome');
        setCardFeeRates(data.cardFeeRates && data.cardFeeRates.length === 12 ? data.cardFeeRates : Array(12).fill(0));
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar as configurações.'))
      .finally(() => setLoading(false));
  }, []);

  async function handleImagePick(
    e: ChangeEvent<HTMLInputElement>,
    setUrl: (url: string) => void,
    setPosition: (pos: Position) => void,
  ) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      setError(`A imagem "${file.name}" tem mais de 2MB — escolha um arquivo menor.`);
      return;
    }
    setError(null);
    setUrl(await readImageAsDataUrl(file));
    // Imagem nova começa centralizada — o enquadramento anterior era de outro arquivo.
    setPosition(CENTER);
  }

  function updateCardFeeRate(index: number, value: number) {
    setCardFeeRates((prev) => prev.map((v, i) => (i === index ? value : v)));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await api.patch<TenantSettings>('/settings', {
        name,
        // Só manda quando tem valor: o campo é único no banco e o back recusa
        // CNPJ inválido, então string vazia viraria erro em vez de 'sem CNPJ'.
        // `\D` (não-dígito), não `D`: com o D solto, "11.222.333/0001-81" ia
        // para o banco com pontuação e a mesma empresa podia se cadastrar duas
        // vezes — a coluna é única e as duas grafias são strings diferentes.
        ...(document.replace(/\D/g, '') ? { document: document.replace(/\D/g, '') } : {}),
        phone: phone.trim() || null,
        addressLine: addressLine.trim() || null,
        primaryColor: primaryColor || null,
        logoUrl,
        logoPosition: formatPosition(logoPosition),
        brandDisplay,
        cardFeeRates,
      });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar as configurações.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <CarregandoLista />;

  return (
    <div>
      <h1 className="mb-1 titulo-pagina">Configurações</h1>
      <p className="mb-6 text-sm text-suave">
        Personalize como sua empresa aparece para os clientes — no cupom impresso, na ordem de serviço e na página de aprovação de orçamento.
      </p>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <form onSubmit={handleSubmit} className="space-y-6">
          <fieldset className="card p-4">
            <legend className="px-1 text-sm font-medium text-texto">Identidade</legend>
            <div className="mt-2 space-y-3">
              <div>
                <label className="mb-1 block text-xs text-suave">Nome da empresa</label>
                <input className="input w-full" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-suave">CNPJ</label>
                  <input
                    className="input w-full"
                    placeholder="00.000.000/0000-00"
                    inputMode="numeric"
                    value={document}
                    onChange={(e) => setDocument(e.target.value)}
                    maxLength={18}
                  />
                  <p className="mt-1 text-xs text-tenue">
                    Necessário para emitir nota fiscal.
                  </p>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-suave">Telefone</label>
                  <input
                    className="input w-full"
                    placeholder="(14) 3333-4444"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    maxLength={40}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-suave">Endereço</label>
                  <input
                    className="input w-full"
                    placeholder="Rua das Oficinas, 123 — Centro, Bauru/SP"
                    value={addressLine}
                    onChange={(e) => setAddressLine(e.target.value)}
                    maxLength={200}
                  />
                </div>
              </div>
              <p className="text-xs text-tenue">
                Telefone e endereço saem impressos no cupom da venda e na ordem de serviço.
              </p>
            </div>
          </fieldset>

          <fieldset className="card p-4">
            <legend className="px-1 text-sm font-medium text-texto">Logo</legend>
            <div className="mt-2 flex items-center gap-4">
              {logoUrl ? (
                <DraggableImage
                  src={logoUrl}
                  position={logoPosition}
                  onPositionChange={setLogoPosition}
                  className="card h-16 w-16 rounded"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded border border-dashed border-linha text-xs text-tenue">
                  sem logo
                </div>
              )}
              <div className="flex flex-col gap-1">
                <label className="btn-secondary cursor-pointer text-center">
                  Escolher imagem
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleImagePick(e, setLogoUrl, setLogoPosition)}
                  />
                </label>
                {logoUrl && (
                  <>
                    <span className="text-xs text-tenue">Arraste a imagem para posicionar</span>
                    <button
                      type="button"
                      onClick={() => setLogoUrl(null)}
                      className="text-xs text-red-600 hover:underline dark:text-red-400"
                    >
                      Remover logo
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* A escolha fica junto da logo, e não numa seção própria, porque
                ela só faz sentido depois de olhar a imagem enviada: é a logo
                que decide se o nome ao lado ajuda ou repete. */}
            <div className="mt-4 border-t border-linha pt-3">
              <p className="text-sm font-medium text-texto">Como sua marca aparece</p>
              <p className="mt-0.5 text-xs text-suave">
                Vale no menu do sistema, no cupom da venda e na ordem de serviço.
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {IDENTIDADES.map((opcao) => (
                  <label key={opcao.valor} className="cursor-pointer">
                    <input
                      type="radio"
                      name="brandDisplay"
                      value={opcao.valor}
                      checked={brandDisplay === opcao.valor}
                      onChange={() => setBrandDisplay(opcao.valor)}
                      className="peer sr-only"
                    />
                    {/* O anel vem do `peer-focus-visible` porque o radio está
                        escondido: sem isso, quem navega por teclado seleciona
                        às cegas. */}
                    <span
                      className={`block rounded-lg border p-2 transition peer-focus-visible:ring-2 peer-focus-visible:ring-marca ${
                        brandDisplay === opcao.valor
                          ? 'border-marca bg-marca/5'
                          : 'border-linha hover:bg-realce'
                      }`}
                    >
                      <MiniaturaDaIdentidade
                        forma={opcao.valor}
                        logoUrl={logoUrl}
                        logoPosition={logoPosition}
                        nome={name}
                        cor={primaryColor || DEFAULT_COLOR}
                      />
                      <span className="mt-2 block text-xs font-medium text-texto">{opcao.titulo}</span>
                      <span className="block text-[11px] leading-snug text-tenue">{opcao.descricao}</span>
                    </span>
                  </label>
                ))}
              </div>
              {!logoUrl && brandDisplay !== 'nome' && (
                <p className="mt-2 text-xs text-suave">
                  Você ainda não enviou uma logo — até enviar, o menu mostra as iniciais e os papéis impressos mostram
                  o nome.
                </p>
              )}
            </div>
          </fieldset>

          <fieldset className="card p-4">
            <legend className="px-1 text-sm font-medium text-texto">Cor de destaque</legend>
            <p className="mt-1 text-xs text-tenue">
              Pinta botões, o item ativo do menu e os destaques do painel.
            </p>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {CORES_SUGERIDAS.map((cor) => (
                <button
                  key={cor.hex}
                  type="button"
                  onClick={() => setPrimaryColor(cor.hex)}
                  title={`${cor.nome} — ${cor.hex}`}
                  aria-label={cor.nome}
                  aria-pressed={primaryColor?.toLowerCase() === cor.hex}
                  className={`h-8 w-8 rounded-lg border transition-transform duration-150 ease-saida hover:scale-110 ${
                    primaryColor?.toLowerCase() === cor.hex
                      ? 'border-texto ring-2 ring-texto/20 ring-offset-2 ring-offset-superficie'
                      : 'border-linha'
                  }`}
                  style={{ backgroundColor: cor.hex }}
                />
              ))}
            </div>

            <div className="mt-3 flex items-center gap-3">
              <input
                type="color"
                value={primaryColor || DEFAULT_COLOR}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="h-10 w-14 cursor-pointer rounded border border-linha bg-transparent"
                aria-label="Escolher outra cor"
              />
              <input
                className="input w-32"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                placeholder={DEFAULT_COLOR}
                pattern="^#[0-9A-Fa-f]{6}$"
                title="Cor em hexadecimal, ex.: #0f172a"
              />
              <span className="text-xs text-tenue">ou escolha a sua</span>
            </div>

            <LeituraDeContraste hex={primaryColor || DEFAULT_COLOR} />
          </fieldset>

          <fieldset className="card p-4">
            <legend className="px-1 text-sm font-medium text-texto">
              Taxas da maquininha de cartão de crédito
            </legend>
            <p className="mt-1 text-xs text-suave">
              Informe a taxa cobrada pela sua operadora em cada parcelamento. No PDV e na confirmação de vendas, o valor a
              cobrar no cartão é calculado automaticamente para repassar essa taxa ao cliente (ajustável a cada venda).
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {INSTALLMENT_COUNTS.map((n) => (
                <label key={n} className="block text-xs">
                  <span className="mb-1 block text-suave">{n}x</span>
                  <div className="flex items-center gap-1">
                    <input
                      className="input w-full px-2 py-1"
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      value={cardFeeRates[n - 1]}
                      onChange={(e) => updateCardFeeRate(n - 1, Number(e.target.value))}
                    />
                    <span className="text-tenue">%</span>
                  </div>
                </label>
              ))}
            </div>
          </fieldset>


          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          {success && <p className="text-sm text-emerald-600 dark:text-emerald-400">Configurações salvas.</p>}

          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Salvando…' : 'Salvar configurações'}
          </button>
        </form>

        {/* Onde a marca aparece de verdade.
            Aqui havia a maquete de uma loja virtual — cabeçalho com "Catálogo ·
            Carrinho · Entrar" e um botão "Adicionar ao carrinho" — de um site
            que não existe. Mostrar os dois lugares reais (o menu do painel e o
            cupom que o cliente leva) é a diferença entre conferir e adivinhar. */}
        <div className="space-y-6">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-tenue">No menu do sistema</p>
            <div className="card overflow-hidden">
              <div className="flex items-center gap-3 border-b border-linha px-4 py-3">
                <MiniaturaDaIdentidade
                  forma={brandDisplay}
                  logoUrl={logoUrl}
                  logoPosition={logoPosition}
                  nome={name}
                  cor={primaryColor || DEFAULT_COLOR}
                  tamanho="normal"
                />
              </div>
              <div className="space-y-1.5 p-4">
                <span
                  className="inline-block rounded-lg px-3 py-2 text-sm font-medium"
                  style={{ backgroundColor: `${primaryColor || DEFAULT_COLOR}1a`, color: primaryColor || DEFAULT_COLOR }}
                >
                  PDV (venda rápida)
                </span>
                <div>
                  <span
                    className="mt-2 inline-block rounded-lg px-4 py-2 text-sm font-medium text-white"
                    style={{ backgroundColor: primaryColor || DEFAULT_COLOR }}
                  >
                    Finalizar venda
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-tenue">No cupom impresso</p>
            <div className="card p-4 text-center font-mono text-[11px] leading-relaxed text-texto">
              {/* Mesma regra do papel de verdade (CabecalhoDaLoja): sem arquivo
                  de logo, o nome volta — iniciais num cupom não identificam
                  ninguém. */}
              {logoUrl && brandDisplay !== 'nome' && (
                <img
                  src={logoUrl}
                  alt=""
                  className={`mx-auto mb-1 object-contain ${brandDisplay === 'logo' ? 'max-h-16' : 'max-h-10'}`}
                />
              )}
              {(!logoUrl || brandDisplay !== 'logo') && (
                <div className="font-semibold uppercase">{name || 'Nome da empresa'}</div>
              )}
              {document && <div>CNPJ {document}</div>}
              {addressLine && <div>{addressLine}</div>}
              {phone && <div>Tel: {phone}</div>}
              <div className="my-2 border-t border-dashed border-linha" />
              <div className="text-tenue">CUPOM NÃO FISCAL</div>
              {!document && !addressLine && !phone && (
                <p className="mt-2 font-sans text-xs text-tenue">
                  Preencha CNPJ, endereço e telefone para o cliente saber de onde veio o comprovante.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * O que a cor escolhida faz com o texto por cima dela.
 *
 * Existe porque o painel corrige a cor por baixo dos panos quando ela não
 * aguenta texto — vermelho puro vira um vermelho mais escuro no botão — e a
 * loja tem o direito de saber disso antes de salvar, em vez de estranhar
 * depois que o botão não ficou da cor do catálogo.
 *
 * O número é o mesmo cálculo da WCAG que o resto do sistema usa: 4,5:1 é o
 * mínimo para texto normal.
 */
function LeituraDeContraste({ hex }: { hex: string }) {
  const diag = diagnosticoDaCor(hex);
  if (!diag) return null;

  return (
    <div className="mt-4 space-y-2 rounded-lg border border-linha bg-realce/50 p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-tenue">Contraste do texto no botão:</span>
        <span className="font-medium tabular-nums text-texto">{diag.contrasteNoBotao.toFixed(2)}:1</span>
        <span className={`badge ${diag.contrasteNoBotao >= 4.5 ? 'badge-ok' : 'badge-erro'}`}>
          {diag.contrasteNoBotao >= 4.5 ? 'legível' : 'baixo'}
        </span>
      </div>

      {diag.ajustada && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Esta cor não aguenta texto por cima ({diag.contrasteComoTextoClaro.toFixed(2)}:1 com branco). O
          painel usa uma versão mais escura dela nos botões, para o rótulo continuar legível. Os
          destaques e o menu seguem com a cor que você escolheu.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <span className="btn-primary btn-sm pointer-events-none">Botão</span>
        <span className="badge badge-marca">Etiqueta</span>
        <span className="text-sm text-marca-legivel underline underline-offset-2">link de exemplo</span>
      </div>
      <p className="text-[11px] text-tenue">
        A prévia acima já está usando a cor salva. Salve para ver a nova valendo em todo o painel.
      </p>
    </div>
  );
}

/**
 * A identidade como ela sai no menu do sistema — em dois tamanhos.
 *
 * O `mini` vive dentro de cada opção de escolha e o `normal` na prévia grande
 * ao lado. Serem o MESMO componente é o ponto: se fossem duas maquetes, a
 * miniatura poderia prometer um arranjo e a prévia mostrar outro.
 *
 * A regra de queda repete a do menu de verdade (Sidebar > IdentidadeDaLoja):
 * "só a logo" sem arquivo de logo se comporta como "logo e nome", com as
 * iniciais no lugar da imagem.
 */
function MiniaturaDaIdentidade({
  forma,
  logoUrl,
  logoPosition,
  nome,
  cor,
  tamanho = 'mini',
}: {
  forma: BrandDisplay;
  logoUrl: string | null;
  logoPosition: Position;
  nome: string;
  cor: string;
  tamanho?: 'mini' | 'normal';
}) {
  const mini = tamanho === 'mini';
  const rotulo = nome || 'Nome da empresa';
  const temLogo = Boolean(logoUrl);
  const soLogo = forma === 'logo' && temLogo;

  const quadrado = temLogo ? (
    <img
      src={logoUrl!}
      alt=""
      className={`shrink-0 rounded border border-linha object-cover ${mini ? 'h-6 w-6' : 'h-9 w-9 rounded-lg'}`}
      style={{ objectPosition: `${logoPosition.x}% ${logoPosition.y}%` }}
    />
  ) : (
    <span
      className={`flex shrink-0 items-center justify-center rounded font-semibold text-white ${
        mini ? 'h-6 w-6 text-[10px]' : 'h-9 w-9 rounded-lg text-sm'
      }`}
      style={{ backgroundColor: cor }}
    >
      {rotulo.slice(0, 1).toUpperCase()}
    </span>
  );

  if (soLogo) {
    return (
      <span className={`flex items-center ${mini ? 'h-8' : 'h-9'}`}>
        <img
          src={logoUrl!}
          alt=""
          className={`object-contain ${mini ? 'max-h-8 max-w-full' : 'max-h-11 max-w-[168px]'}`}
        />
      </span>
    );
  }

  const texto = (
    <span className="min-w-0 flex-1">
      <span
        className={`block truncate font-semibold leading-tight text-texto ${
          mini ? 'text-[11px]' : forma === 'nome' ? 'text-base' : 'text-sm'
        }`}
      >
        {rotulo}
      </span>
      {!mini && <span className="block text-[11px] leading-tight text-tenue">ComerciON</span>}
    </span>
  );

  if (forma === 'nome') {
    return <span className={`flex items-center ${mini ? 'h-8' : 'h-9'}`}>{texto}</span>;
  }

  return (
    <span className={`flex items-center ${mini ? 'h-8 gap-1.5' : 'h-9 gap-3'}`}>
      {quadrado}
      {texto}
    </span>
  );
}
