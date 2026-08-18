/**
 * Como a identidade da loja aparece no menu e no cupom impresso.
 *
 * Fica no common porque é usado pelo DTO de settings e pelo painel: os dois
 * precisam concordar sobre quais valores existem, e uma lista duplicada é uma
 * lista que um dia divergir.
 */
export const BRAND_DISPLAYS = ['logo_e_nome', 'logo', 'nome'] as const;

export type BrandDisplay = (typeof BRAND_DISPLAYS)[number];

export const BRAND_DISPLAY_PADRAO: BrandDisplay = 'logo_e_nome';
