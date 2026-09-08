/**
 * Quem sabe mandar mensagem pelo socket de uma loja.
 *
 * Existe como interface e token, e não como a classe direto, por um motivo
 * prático: quem implementa isto importa o Baileys, que é ESM e o Jest não
 * consegue parsear. Uma dependência direta da classe arrastaria o Baileys
 * para dentro de todo arquivo que quisesse enviar — e para dentro de todo
 * spec que os testasse, quebrando a compilação da suíte.
 *
 * A interface é estreita de propósito: a fila de envio precisa de uma função,
 * não de um serviço de sessão inteiro.
 */
export const ENVIADOR_DE_SESSAO = Symbol('ENVIADOR_DE_SESSAO');

export interface EnviadorDeSessao {
  enviar(tenantId: string, telefone: string, texto: string): Promise<{ externalId: string }>;
}
