import { test, expect, api, API_URL, SENHA, type Loja } from '../fixtures';
import type { APIRequestContext } from '@playwright/test';

/**
 * Emitir nota fiscal, de ponta a ponta, usando só o que a loja tem à mão.
 *
 * Este arquivo existe porque o módulo fiscal era **inalcançável**. As colunas
 * que a SEFAZ exige (ncm, cfop, icmsCst, icmsOrigem) estavam no banco desde o
 * começo e o serviço fiscal recusava emitir sem NCM — mas nenhuma rota aceitava
 * esses campos, e nada em toda a base os gravava. Resultado: todo produto
 * nascia sem NCM e nenhuma nota podia ser emitida, nunca.
 *
 * Havia um segundo muro: a mensagem de erro mandava "cadastrar o CNPJ em
 * Configurações", e a tela de Configurações não tinha o campo. O CNPJ só podia
 * ser informado no cadastro inicial, onde é opcional.
 *
 * Os testes unitários do fiscal passavam porque mocavam o produto já com NCM.
 * Por isso o teste que vale é este: a loja nasce sem CNPJ, como quem se
 * cadastrou sem informar, e precisa chegar até a nota emitida.
 */

/** CNPJ válido gerado na hora — a coluna é única e a suíte roda muitas vezes. */
function cnpjValido() {
  const base = `${Array.from({ length: 8 }, () => Math.floor(Math.random() * 10)).join('')}0001`;
  const digito = (nums: string) => {
    const pesos = nums.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = nums.split('').reduce((acc, n, i) => acc + Number(n) * pesos[i], 0);
    const resto = soma % 11;
    return resto < 2 ? '0' : String(11 - resto);
  };
  const d1 = digito(base);
  return base + d1 + digito(base + d1);
}

/** Loja sem CNPJ: é o caso de quem se cadastrou sem informar. */
async function lojaSemCnpj(request: APIRequestContext): Promise<Loja> {
  const sufixo = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const slug = `fiscal-${sufixo}`;
  const resposta = await request.post(`${API_URL}/api/auth/register-tenant`, {
    data: {
      tenantName: `Loja Fiscal ${sufixo}`,
      tenantSlug: slug,
      adminName: 'Dono',
      adminEmail: `dono@${sufixo}.teste`,
      adminPassword: SENHA,
      planKey: 'premium',
    },
  });
  expect(resposta.ok()).toBeTruthy();
  const corpo = await resposta.json();
  return { slug, nome: corpo.tenant.name, email: `dono@${sufixo}.teste`, senha: SENHA, accessToken: corpo.accessToken };
}

test.describe('nota fiscal', () => {
  test('a loja consegue emitir e cancelar uma NFC-e usando só a API', async ({ request }) => {
    const loja = await lojaSemCnpj(request);
    const [deposito] = await api(request, loja, 'get', '/warehouses');

    // 1. O CNPJ é cadastrável em Configurações — a tela que a mensagem de erro cita.
    const config = await api(request, loja, 'patch', '/settings', { document: cnpjValido() });
    expect(config.document, 'o CNPJ precisa ficar gravado').toBeTruthy();

    // 2. O produto aceita os dados que a SEFAZ exige.
    const produto = await api(request, loja, 'post', '/products', {
      sku: `NF-${Math.random().toString(36).slice(2, 9)}`,
      name: 'Pastilha de freio',
      price: 100,
      costPrice: 50,
      ncm: '87089990',
    });
    expect(produto.ncm).toBe('87089990');

    const completo = await api(request, loja, 'patch', `/products/${produto.id}`, {
      cfop: '5102',
      icmsCst: '102',
      icmsOrigem: '0',
    });
    expect(completo.cfop).toBe('5102');

    // 3. Venda confirmada e nota emitida.
    await api(request, loja, 'post', '/inventory/stock/adjust', {
      productId: produto.id,
      warehouseId: deposito.id,
      type: 'IN',
      quantity: 5,
      reason: 'carga do teste',
    });
    const venda = await api(request, loja, 'post', '/sales', {
      warehouseId: deposito.id,
      items: [{ productId: produto.id, quantity: 1, unitPrice: 100 }],
      payments: [{ method: 'CASH', amount: 100 }],
      confirm: true,
    });

    const nota = await api(request, loja, 'post', `/fiscal/invoices/sales/${venda.id}/issue`, { type: 'NFCE' });
    expect(nota.status).toBe('ISSUED');
    expect(nota.accessKey, 'nota emitida sem chave de acesso não serve para nada').toBeTruthy();

    const cancelada = await api(request, loja, 'post', `/fiscal/invoices/sales/${venda.id}/cancel`, {
      reason: 'Cancelamento do teste de ponta a ponta',
    });
    expect(cancelada.status).toBe('CANCELED');
  });

  test('produto sem NCM é recusado com uma mensagem que diz o que fazer', async ({ request }) => {
    const loja = await lojaSemCnpj(request);
    const [deposito] = await api(request, loja, 'get', '/warehouses');
    await api(request, loja, 'patch', '/settings', { document: cnpjValido() });

    const produto = await api(request, loja, 'post', '/products', {
      sku: `SEMNCM-${Math.random().toString(36).slice(2, 9)}`,
      name: 'Peça sem NCM',
      price: 50,
      costPrice: 20,
    });
    await api(request, loja, 'post', '/inventory/stock/adjust', {
      productId: produto.id,
      warehouseId: deposito.id,
      type: 'IN',
      quantity: 2,
      reason: 'carga do teste',
    });
    const venda = await api(request, loja, 'post', '/sales', {
      warehouseId: deposito.id,
      items: [{ productId: produto.id, quantity: 1, unitPrice: 50 }],
      payments: [{ method: 'CASH', amount: 50 }],
      confirm: true,
    });

    const resposta = await request.post(`${API_URL}/api/fiscal/invoices/sales/${venda.id}/issue`, {
      headers: { Authorization: `Bearer ${loja.accessToken}`, 'x-tenant-slug': loja.slug },
      data: { type: 'NFCE' },
    });

    expect(resposta.status()).toBe(400);
    expect(JSON.stringify(await resposta.json()), 'a mensagem tem de nomear o NCM e o produto').toContain('NCM');
  });

  test('CNPJ e NCM inválidos são recusados na entrada', async ({ request }) => {
    const loja = await lojaSemCnpj(request);
    const cabecalhos = { Authorization: `Bearer ${loja.accessToken}`, 'x-tenant-slug': loja.slug };

    const cnpjRuim = await request.patch(`${API_URL}/api/settings`, {
      headers: cabecalhos,
      data: { document: '11111111111111' },
    });
    expect(cnpjRuim.status(), 'CNPJ com dígito verificador errado não pode entrar').toBe(400);

    const ncmRuim = await request.post(`${API_URL}/api/products`, {
      headers: cabecalhos,
      data: { sku: `RUIM-${Math.random().toString(36).slice(2, 9)}`, name: 'Peça', price: 10, ncm: '123' },
    });
    expect(ncmRuim.status(), 'NCM tem 8 dígitos — recusar antes de a SEFAZ recusar').toBe(400);
  });
});
