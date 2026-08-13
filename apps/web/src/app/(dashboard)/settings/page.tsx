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
  const [tagline, setTagline] = useState('');
  const [phone, setPhone] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [description, setDescription] = useState('');
  const [primaryColor, setPrimaryColor] = useState(DEFAULT_COLOR);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [logoPosition, setLogoPosition] = useState<Position>(CENTER);
  const [bannerPosition, setBannerPosition] = useState<Position>(CENTER);
  const [cardFeeRates, setCardFeeRates] = useState<number[]>(Array(12).fill(0));

  useEffect(() => {
    api
      .get<TenantSettings>('/settings')
      .then((data) => {
        setName(data.name);
        setTagline(data.tagline ?? '');
        setPhone(data.phone ?? '');
        setAddressLine(data.addressLine ?? '');
        setDescription(data.description ?? '');
        setPrimaryColor(data.primaryColor ?? DEFAULT_COLOR);
        setLogoUrl(data.logoUrl);
        setBannerUrl(data.bannerUrl);
        setLogoPosition(parsePosition(data.logoPosition));
        setBannerPosition(parsePosition(data.bannerPosition));
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
        tagline: tagline.trim() || null,
        phone: phone.trim() || null,
        addressLine: addressLine.trim() || null,
        description: description.trim() || null,
        primaryColor: primaryColor || null,
        logoUrl,
        bannerUrl,
        logoPosition: formatPosition(logoPosition),
        bannerPosition: formatPosition(bannerPosition),
        cardFeeRates,
      });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar as configurações.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-slate-500 dark:text-slate-400">Carregando…</p>;

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold">Configurações</h1>
      <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
        Personalize como sua empresa aparece para os clientes — no cupom impresso, na ordem de serviço e na página de aprovação de orçamento.
      </p>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <form onSubmit={handleSubmit} className="space-y-6">
          <fieldset className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <legend className="px-1 text-sm font-medium text-slate-700 dark:text-slate-200">Identidade</legend>
            <div className="mt-2 space-y-3">
              <div>
                <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">Nome da empresa</label>
                <input className="input w-full" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">Slogan (opcional)</label>
                <input
                  className="input w-full"
                  placeholder="Ex.: Peças com entrega em todo o Brasil"
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  maxLength={200}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">Sobre a empresa (opcional)</label>
                <textarea
                  className="input w-full"
                  rows={4}
                  placeholder="Um texto curto mostrado na página inicial da loja"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={2000}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">Telefone</label>
                  <input
                    className="input w-full"
                    placeholder="(14) 3333-4444"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    maxLength={40}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">Endereço</label>
                  <input
                    className="input w-full"
                    placeholder="Rua das Oficinas, 123 — Centro, Bauru/SP"
                    value={addressLine}
                    onChange={(e) => setAddressLine(e.target.value)}
                    maxLength={200}
                  />
                </div>
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Telefone e endereço saem impressos no cupom da venda e na ordem de serviço.
              </p>
            </div>
          </fieldset>

          <fieldset className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <legend className="px-1 text-sm font-medium text-slate-700 dark:text-slate-200">Cor de destaque</legend>
            <div className="mt-2 flex items-center gap-3">
              <input
                type="color"
                value={primaryColor || DEFAULT_COLOR}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="h-10 w-14 cursor-pointer rounded border border-slate-300 bg-transparent dark:border-slate-600"
              />
              <input
                className="input w-32"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                placeholder={DEFAULT_COLOR}
                pattern="^#[0-9A-Fa-f]{6}$"
                title="Cor em hexadecimal, ex.: #0f172a"
              />
              <span className="text-xs text-slate-400 dark:text-slate-500">Imagem de destaque da empresa</span>
            </div>
          </fieldset>

          <fieldset className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <legend className="px-1 text-sm font-medium text-slate-700 dark:text-slate-200">
              Taxas da maquininha de cartão de crédito
            </legend>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Informe a taxa cobrada pela sua operadora em cada parcelamento. No PDV e na confirmação de vendas, o valor a
              cobrar no cartão é calculado automaticamente para repassar essa taxa ao cliente (ajustável a cada venda).
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {INSTALLMENT_COUNTS.map((n) => (
                <label key={n} className="block text-xs">
                  <span className="mb-1 block text-slate-500 dark:text-slate-400">{n}x</span>
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
                    <span className="text-slate-400 dark:text-slate-500">%</span>
                  </div>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <legend className="px-1 text-sm font-medium text-slate-700 dark:text-slate-200">Logo</legend>
            <div className="mt-2 flex items-center gap-4">
              {logoUrl ? (
                <DraggableImage
                  src={logoUrl}
                  position={logoPosition}
                  onPositionChange={setLogoPosition}
                  className="h-16 w-16 rounded border border-slate-200 dark:border-slate-700"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded border border-dashed border-slate-300 text-xs text-slate-400 dark:border-slate-600 dark:text-slate-500">
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
                    <span className="text-xs text-slate-400 dark:text-slate-500">Arraste a imagem para posicionar</span>
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

          <fieldset className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <legend className="px-1 text-sm font-medium text-slate-700 dark:text-slate-200">Banner da página inicial</legend>
            <div className="mt-2 space-y-3">
              {bannerUrl ? (
                <DraggableImage
                  src={bannerUrl}
                  position={bannerPosition}
                  onPositionChange={setBannerPosition}
                  className="h-32 w-full rounded border border-slate-200 dark:border-slate-700"
                />
              ) : (
                <div className="flex h-32 w-full items-center justify-center rounded border border-dashed border-slate-300 text-xs text-slate-400 dark:border-slate-600 dark:text-slate-500">
                  sem banner
                </div>
              )}
              <div className="flex items-center gap-3">
                <label className="btn-secondary cursor-pointer text-center">
                  Escolher imagem
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleImagePick(e, setBannerUrl, setBannerPosition)}
                  />
                </label>
                {bannerUrl && (
                  <>
                    <span className="text-xs text-slate-400 dark:text-slate-500">Arraste a imagem para posicionar</span>
                    <button
                      type="button"
                      onClick={() => setBannerUrl(null)}
                      className="text-xs text-red-600 hover:underline dark:text-red-400"
                    >
                      Remover banner
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

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Pré-visualização da loja
          </p>
          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-center gap-2">
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt=""
                    className="h-8 w-8 rounded object-cover"
                    style={{ objectPosition: `${logoPosition.x}% ${logoPosition.y}%` }}
                  />
                ) : (
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded text-xs font-semibold text-white"
                    style={{ backgroundColor: primaryColor || DEFAULT_COLOR }}
                  >
                    {name.slice(0, 1).toUpperCase() || '?'}
                  </div>
                )}
                <span className="font-semibold text-slate-900 dark:text-slate-100">{name || 'Nome da empresa'}</span>
              </div>
              <span className="text-xs text-slate-400 dark:text-slate-500">Catálogo · Carrinho · Entrar</span>
            </div>

            {bannerUrl && (
              <img
                src={bannerUrl}
                alt=""
                className="h-32 w-full object-cover"
                style={{ objectPosition: `${bannerPosition.x}% ${bannerPosition.y}%` }}
              />
            )}

            <div className="bg-slate-50 p-4 dark:bg-slate-950">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{name || 'Nome da empresa'}</h2>
              {tagline && <p className="text-sm text-slate-600 dark:text-slate-300">{tagline}</p>}
              {description && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{description}</p>}
              <button
                type="button"
                className="mt-3 rounded-lg px-3 py-1.5 text-xs font-medium text-white"
                style={{ backgroundColor: primaryColor || DEFAULT_COLOR }}
              >
                Adicionar ao carrinho
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
