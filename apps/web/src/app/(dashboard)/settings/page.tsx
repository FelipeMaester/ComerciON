'use client';

import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api-client';
import type { TenantSettings } from '@/lib/types';

const DEFAULT_COLOR = '#0f172a';
// Mesmo teto (em bytes, antes de virar base64) usado como referência pelo
// backend — falhar aqui é mais rápido para o usuário do que esperar o PATCH
// voltar com 400.
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

function readImageAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [name, setName] = useState('');
  const [tagline, setTagline] = useState('');
  const [description, setDescription] = useState('');
  const [primaryColor, setPrimaryColor] = useState(DEFAULT_COLOR);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<TenantSettings>('/settings')
      .then((data) => {
        setName(data.name);
        setTagline(data.tagline ?? '');
        setDescription(data.description ?? '');
        setPrimaryColor(data.primaryColor ?? DEFAULT_COLOR);
        setLogoUrl(data.logoUrl);
        setBannerUrl(data.bannerUrl);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar as configurações.'))
      .finally(() => setLoading(false));
  }, []);

  async function handleImagePick(e: ChangeEvent<HTMLInputElement>, setter: (url: string) => void) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      setError(`A imagem "${file.name}" tem mais de 2MB — escolha um arquivo menor.`);
      return;
    }
    setError(null);
    setter(await readImageAsDataUrl(file));
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
        description: description.trim() || null,
        primaryColor: primaryColor || null,
        logoUrl,
        bannerUrl,
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
        Personalize como sua empresa aparece para os clientes na loja virtual.
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
              <span className="text-xs text-slate-400 dark:text-slate-500">Usada em destaques da loja virtual</span>
            </div>
          </fieldset>

          <fieldset className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <legend className="px-1 text-sm font-medium text-slate-700 dark:text-slate-200">Logo</legend>
            <div className="mt-2 flex items-center gap-4">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="h-16 w-16 rounded border border-slate-200 object-contain dark:border-slate-700" />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded border border-dashed border-slate-300 text-xs text-slate-400 dark:border-slate-600 dark:text-slate-500">
                  sem logo
                </div>
              )}
              <div className="flex flex-col gap-1">
                <label className="btn-secondary cursor-pointer text-center">
                  Escolher imagem
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImagePick(e, setLogoUrl)} />
                </label>
                {logoUrl && (
                  <button type="button" onClick={() => setLogoUrl(null)} className="text-xs text-red-600 hover:underline dark:text-red-400">
                    Remover logo
                  </button>
                )}
              </div>
            </div>
          </fieldset>

          <fieldset className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <legend className="px-1 text-sm font-medium text-slate-700 dark:text-slate-200">Banner da página inicial</legend>
            <div className="mt-2 space-y-3">
              {bannerUrl ? (
                <img src={bannerUrl} alt="Banner" className="h-32 w-full rounded border border-slate-200 object-cover dark:border-slate-700" />
              ) : (
                <div className="flex h-32 w-full items-center justify-center rounded border border-dashed border-slate-300 text-xs text-slate-400 dark:border-slate-600 dark:text-slate-500">
                  sem banner
                </div>
              )}
              <div className="flex items-center gap-3">
                <label className="btn-secondary cursor-pointer text-center">
                  Escolher imagem
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImagePick(e, setBannerUrl)} />
                </label>
                {bannerUrl && (
                  <button type="button" onClick={() => setBannerUrl(null)} className="text-xs text-red-600 hover:underline dark:text-red-400">
                    Remover banner
                  </button>
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
                  <img src={logoUrl} alt="" className="h-8 w-8 rounded object-contain" />
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

            {bannerUrl && <img src={bannerUrl} alt="" className="h-32 w-full object-cover" />}

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
