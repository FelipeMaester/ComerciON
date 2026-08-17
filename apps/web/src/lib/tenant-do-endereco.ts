/**
 * Descobre a loja pelo endereço que o navegador está acessando.
 *
 * `oficina-do-ze.painel.minhaloja.com.br` → `oficina-do-ze`
 *
 * Mesma regra da API (apps/api/src/common/tenant/slug-do-host.ts), e pelo
 * mesmo motivo: o domínio-base é configurado, não deduzido contando pontos.
 * As duas implementações precisam concordar — se divergirem, o painel manda
 * um identificador e a API resolve outro.
 *
 * NEXT_PUBLIC_TENANT_BASE_DOMAIN é embutido no bundle em tempo de build, como
 * a URL da API. Trocar o domínio exige rebuild, não só reiniciar.
 */

const SLUG_VALIDO = /^[a-z0-9][a-z0-9-]*$/;

export function slugDoEndereco(hostname?: string): string | null {
  const base = process.env.NEXT_PUBLIC_TENANT_BASE_DOMAIN;
  const nome = (hostname ?? (typeof window === 'undefined' ? '' : window.location.hostname))
    .trim()
    .toLowerCase();

  if (!nome || !base) return null;

  const limpo = base.trim().toLowerCase().replace(/^\.+|\.+$/g, '');
  if (!limpo || nome === limpo) return null;

  const sufixo = `.${limpo}`;
  if (!nome.endsWith(sufixo)) return null;

  const prefixo = nome.slice(0, -sufixo.length);
  if (!prefixo || prefixo.includes('.') || !SLUG_VALIDO.test(prefixo)) return null;

  return prefixo;
}
