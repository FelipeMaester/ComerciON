import type { TenantSettings } from '@/lib/types';

/**
 * Quem emitiu o papel: logo, nome e os dados de contato.
 *
 * Existe como componente porque o cupom e a ordem de serviço precisam concordar
 * — a loja que escolheu "só a logo" não quer o nome aparecendo no A4 e sumindo
 * na bobina. A escolha vem de `brandDisplay`, a mesma que governa o menu.
 *
 * Duas diferenças propositais em relação ao menu:
 *
 * 1. Sem logo enviada, aqui NÃO caímos nas iniciais. Um quadrado com "AP"
 *    impresso não identifica ninguém num papel que vai para a pasta do cliente
 *    — o nome da loja faz esse trabalho melhor. Então, sem arquivo de logo,
 *    qualquer modo imprime o nome.
 * 2. A logo nunca é recortada (`contain`, e `logoPosition` é ignorado de
 *    propósito): papel é passagem única, e cortar a marca do cliente na nota
 *    dele é pior do que imprimi-la um pouco menor.
 */
export function CabecalhoDaLoja({ loja, formato }: { loja: TenantSettings; formato: 'cupom' | 'a4' }) {
  const forma = loja.brandDisplay ?? 'logo_e_nome';
  const temLogo = Boolean(loja.logoUrl);
  const mostrarLogo = temLogo && forma !== 'nome';
  const mostrarNome = !temLogo || forma !== 'logo';

  const contato = (
    <>
      {loja.document && <div className={formato === 'a4' ? 'print-muted' : undefined}>CNPJ {loja.document}</div>}
      {loja.addressLine && <div className={formato === 'a4' ? 'print-muted' : undefined}>{loja.addressLine}</div>}
      {loja.phone && <div className={formato === 'a4' ? 'print-muted' : undefined}>Tel: {loja.phone}</div>}
    </>
  );

  // O CNPJ fica mesmo quando o nome sai: é ele que identifica o emitente para
  // quem recebe o papel, e é o que a pessoa vai usar se precisar reclamar.
  const logo = mostrarLogo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={loja.logoUrl!}
      alt={loja.name}
      className={`print-logo ${forma === 'logo' ? 'print-logo--sozinha' : ''}`}
    />
  ) : null;

  if (formato === 'cupom') {
    return (
      <div className="print-center">
        {logo}
        {mostrarNome && (
          <div className="print-bold" style={{ fontSize: 13 }}>
            {loja.name}
          </div>
        )}
        {contato}
      </div>
    );
  }

  return (
    <div className="print-identidade">
      {logo}
      <div>
        {mostrarNome && (
          <div className="print-bold" style={{ fontSize: 18 }}>
            {loja.name}
          </div>
        )}
        {contato}
      </div>
    </div>
  );
}
