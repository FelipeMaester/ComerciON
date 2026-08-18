import { api } from './api-client';
import type { ModuleKey, TenantModules, UserProfile } from './types';

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

/**
 * Módulos que o plano da loja libera — a MESMA lista que o gate da API usa
 * para devolver 403.
 *
 * Cacheada pelo mesmo motivo do perfil: o menu lateral e a paleta de comandos
 * precisam dela para não oferecer uma tela que vai dar 403 ao clicar, e sem o
 * cache seriam duas requisições por página para o mesmo dado.
 */
let modulosEmAndamento: Promise<ModuleKey[]> | null = null;

export function carregarModulos(): Promise<ModuleKey[]> {
  if (!modulosEmAndamento) {
    modulosEmAndamento = api
      .get<TenantModules>('/billing/my-modules')
      .then((dados) => dados.modules)
      .catch((erro) => {
        modulosEmAndamento = null;
        throw erro;
      });
  }
  return modulosEmAndamento;
}

/** Chamado no logout e ao salvar Configurações: o próximo acesso relê do servidor. */
export function esquecerPerfil(): void {
  emAndamento = null;
  modulosEmAndamento = null;
}
