import { api } from './api-client';
import type { UserProfile } from './types';

/**
 * O perfil do usuário e a identidade da loja, carregados uma vez por sessão.
 *
 * O menu lateral e a barra do topo precisam do mesmo dado (nome da loja, logo,
 * cor, nome de quem está logado). Sem este cache os dois componentes fariam a
 * mesma chamada a cada navegação — duas requisições por página, para um dado
 * que praticamente não muda.
 *
 * Guardar a promessa, e não o resultado, evita a corrida: se os dois pedirem
 * ao mesmo tempo antes da resposta chegar, ainda assim sai uma requisição só.
 */
let emAndamento: Promise<UserProfile> | null = null;

export function carregarPerfil(): Promise<UserProfile> {
  if (!emAndamento) {
    emAndamento = api.get<UserProfile>('/auth/me').catch((erro) => {
      // Falhou? Esquece, para a próxima tentativa não herdar o erro para sempre.
      emAndamento = null;
      throw erro;
    });
  }
  return emAndamento;
}

/** Chamado no logout e ao salvar Configurações: o próximo acesso relê do servidor. */
export function esquecerPerfil(): void {
  emAndamento = null;
}
