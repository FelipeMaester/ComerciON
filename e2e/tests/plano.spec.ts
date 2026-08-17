import { test, expect, criarLoja, api, API_URL, SENHA } from '../fixtures';

/**
 * O plano é o que sustenta o negócio — e dava para pular ele digitando
 * qualquer coisa.
 *
 * Medido antes da correção: mandar `planKey: "basico"` (ou vazio) no cadastro
 * self-service fazia `subscribe()` estourar com "plano não encontrado", o erro
 * era engolido por um try/catch, a loja nascia SEM assinatura — e o gate lia
 * "sem assinatura" como acesso liberado. Resultado: 13 módulos, um a mais que
 * o Premium de R$ 399, de graça e para sempre.
 *
 * Estes testes são sobre dinheiro entrando, não sobre código HTTP: o que não
 * pode acontecer é uma loja usar módulo pago sem plano que o inclua.
 */

/** Rotas de módulos que só os planos pagos incluem. */
const ROTAS_PAGAS = [
  ['automações', '/automation-rules'],
  ['fiscal', '/fiscal/invoices/sales/00000000-0000-0000-0000-000000000000'],
] as const;

async function cadastrar(request: Parameters<typeof criarLoja>[0], planKey: string | undefined) {
  const sufixo = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const slug = `plano-${sufixo}`;
  const resposta = await request.post(`${API_URL}/api/auth/register-tenant`, {
    data: {
      tenantName: `Loja ${sufixo}`,
      tenantSlug: slug,
      adminName: 'Dono',
      adminEmail: `dono@${sufixo}.teste`,
      adminPassword: SENHA,
      ...(planKey === undefined ? {} : { planKey }),
    },
  });
  expect(resposta.ok(), 'um plano errado não deve impedir alguém de se cadastrar').toBeTruthy();
  const corpo = await resposta.json();
  return { slug, nome: corpo.tenant.name, email: `dono@${sufixo}.teste`, senha: SENHA, accessToken: corpo.accessToken };
}

test.describe('plano e acesso a módulo pago', () => {
  for (const [rotulo, planKey] of [
    ['inexistente', 'basico'],
    ['vazio', ''],
    ['ausente', undefined],
  ] as const) {
    test(`plano ${rotulo} cai no gratuito, sem liberar módulo pago`, async ({ request }) => {
      const loja = await cadastrar(request, planKey);

      const assinatura = await api(request, loja, 'get', '/billing/subscription');
      expect(assinatura?.plan?.key ?? assinatura?.planKey, 'tem de haver assinatura, e ser a gratuita').toBe('trial');

      for (const [nome, rota] of ROTAS_PAGAS) {
        const resposta = await request.get(`${API_URL}/api${rota}`, {
          headers: { Authorization: `Bearer ${loja.accessToken}`, 'x-tenant-slug': loja.slug },
        });
        expect(resposta.status(), `${nome} não está no plano gratuito`).toBe(403);
      }
    });
  }

  test('quem assina Premium usa os módulos que pagou', async ({ request }) => {
    const loja = await criarLoja(request, 'premium');

    for (const [nome, rota] of ROTAS_PAGAS) {
      const resposta = await request.get(`${API_URL}/api${rota}`, {
        headers: { Authorization: `Bearer ${loja.accessToken}`, 'x-tenant-slug': loja.slug },
      });
      expect(resposta.status(), `${nome} está incluído no Premium`).not.toBe(403);
    }
  });
});
