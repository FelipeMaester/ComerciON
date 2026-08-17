'use client';

import { ChangeEvent, FormEvent, PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api-client';
import type { TenantSettings } from '@/lib/types';

const DEFAULT_COLOR = '#0f172a';
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
        ...(document.replace(/D/g, '') ? { document: document.replace(/D/g, '') } : {}),
        phone: phone.trim() || null,
        addressLine: addressLine.trim() || null,
        primaryColor: primaryColor || null,
        logoUrl,
        logoPosition: formatPosition(logoPosition),
        cardFeeRates,
      });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar as configurações.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-suave">Carregando…</p>;

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
            <legend className="px-1 text-sm font-medium text-texto">Cor de destaque</legend>
            <div className="mt-2 flex items-center gap-3">
              <input
                type="color"
                value={primaryColor || DEFAULT_COLOR}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="h-10 w-14 cursor-pointer rounded border border-linha bg-transparent"
              />
              <input
                className="input w-32"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                placeholder={DEFAULT_COLOR}
                pattern="^#[0-9A-Fa-f]{6}$"
                title="Cor em hexadecimal, ex.: #0f172a"
              />
              <span className="text-xs text-tenue">Pinta botões, o item ativo do menu e os destaques do painel.</span>
            </div>
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
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt=""
                    className="h-9 w-9 shrink-0 rounded-lg border border-linha object-cover"
                    style={{ objectPosition: `${logoPosition.x}% ${logoPosition.y}%` }}
                  />
                ) : (
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-white"
                    style={{ backgroundColor: primaryColor || DEFAULT_COLOR }}
                  >
                    {name.slice(0, 1).toUpperCase() || '?'}
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold leading-tight text-texto">
                    {name || 'Nome da empresa'}
                  </span>
                  <span className="block text-[11px] leading-tight text-tenue">ComerciON</span>
                </span>
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
              <div className="font-semibold uppercase">{name || 'Nome da empresa'}</div>
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
