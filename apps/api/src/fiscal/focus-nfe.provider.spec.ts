import { FocusNfeProvider } from './focus-nfe.provider';
import { StubFiscalProvider } from './stub-fiscal.provider';
import { IssueInvoiceParams } from './fiscal-provider.interface';

const TOKEN = 'token-de-teste';

function params(overrides: Partial<IssueInvoiceParams> = {}): IssueInvoiceParams {
  return {
    type: 'NFCE',
    ref: 'venda-1',
    emitter: { cnpj: '12.345.678/0001-99' },
    items: [
      {
        productCode: 'SKU-1',
        description: 'Radiador',
        ncm: '8708.99.90',
        cfop: '5102',
        unit: 'UN',
        quantity: 2,
        unitPrice: 160.5,
        totalPrice: 321,
        icmsOrigin: '0',
        icmsCst: '102',
      },
    ],
    payments: [{ method: 'CASH', amount: 321 }],
    totalAmount: 321,
    issuedAt: new Date('2026-08-12T15:00:00Z'),
    ...overrides,
  };
}

function mockFetch(responses: { status?: number; body: unknown }[]) {
  const fn = jest.fn();
  for (const r of responses) {
    fn.mockResolvedValueOnce({
      ok: (r.status ?? 200) < 400,
      status: r.status ?? 200,
      text: async () => JSON.stringify(r.body),
    });
  }
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

const AUTORIZADO = {
  status: 'autorizado',
  status_sefaz: '100',
  mensagem_sefaz: 'Autorizado o uso da NF-e',
  chave_nfe: '3'.repeat(44),
  numero: '000123',
  serie: '1',
  caminho_danfe: '/notas/danfe.pdf',
  caminho_xml_nota_fiscal: '/notas/nota.xml',
  numero_protocolo: '135240001',
};

describe('FocusNfeProvider', () => {
  afterEach(() => jest.restoreAllMocks());

  describe('emissão', () => {
    it('chama o endpoint certo, em homologação, com Basic auth do token', async () => {
      const fetchMock = mockFetch([{ body: AUTORIZADO }]);
      await new FocusNfeProvider(TOKEN, true).issue(params());

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://homologacao.focusnfe.com.br/v2/nfce?ref=venda-1');
      expect(init.method).toBe('POST');
      // Basic auth com o token como usuário e senha vazia — formato do Focus.
      expect(init.headers.Authorization).toBe(`Basic ${Buffer.from(`${TOKEN}:`).toString('base64')}`);
    });

    it('usa a URL de produção quando não é sandbox', async () => {
      const fetchMock = mockFetch([{ body: AUTORIZADO }]);
      await new FocusNfeProvider(TOKEN, false).issue(params());
      expect(fetchMock.mock.calls[0][0]).toContain('https://api.focusnfe.com.br/v2/nfce');
    });

    it('envia NF-e no endpoint /nfe, não /nfce', async () => {
      const fetchMock = mockFetch([{ body: AUTORIZADO }]);
      await new FocusNfeProvider(TOKEN, true).issue(params({ type: 'NFE' }));
      expect(fetchMock.mock.calls[0][0]).toContain('/v2/nfe?ref=');
    });

    it('monta o corpo no formato do Focus, com os campos que a SEFAZ exige', async () => {
      const fetchMock = mockFetch([{ body: AUTORIZADO }]);
      await new FocusNfeProvider(TOKEN, true).issue(params());

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      // CNPJ e NCM vão só com dígitos: máscara faz a SEFAZ rejeitar.
      expect(body.cnpj_emitente).toBe('12345678000199');
      expect(body.items[0]).toMatchObject({
        numero_item: 1,
        codigo_produto: 'SKU-1',
        codigo_ncm: '87089990',
        cfop: '5102',
        quantidade_comercial: 2,
        valor_unitario_comercial: 160.5,
        valor_bruto: 321,
        icms_origem: '0',
        icms_situacao_tributaria: '102',
      });
      // Dinheiro = código 01 na tabela de formas de pagamento da SEFAZ.
      expect(body.formas_pagamento).toEqual([{ forma_pagamento: '01', valor_pagamento: 321 }]);
    });

    it('traduz cada forma de pagamento para o código da SEFAZ', async () => {
      const fetchMock = mockFetch([{ body: AUTORIZADO }]);
      await new FocusNfeProvider(TOKEN, true).issue(
        params({
          payments: [
            { method: 'CREDIT_CARD', amount: 100 },
            { method: 'PIX', amount: 200 },
          ],
        }),
      );

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.formas_pagamento.map((p: { forma_pagamento: string }) => p.forma_pagamento)).toEqual(['03', '17']);
    });

    it('devolve chave, número e as URLs absolutas de DANFE e XML', async () => {
      mockFetch([{ body: AUTORIZADO }]);
      const result = await new FocusNfeProvider(TOKEN, true).issue(params());

      expect(result).toMatchObject({
        accessKey: '3'.repeat(44),
        number: '000123',
        series: '1',
        protocol: '135240001',
        sefazStatus: '100',
      });
      // O Focus devolve caminho relativo; sem o host a URL não abre.
      expect(result.danfeUrl).toBe('https://homologacao.focusnfe.com.br/notas/danfe.pdf');
      expect(result.xmlUrl).toBe('https://homologacao.focusnfe.com.br/notas/nota.xml');
    });

    it('inclui o destinatário só quando a venda foi identificada', async () => {
      const fetchMock = mockFetch([{ body: AUTORIZADO }, { body: AUTORIZADO }]);
      const provider = new FocusNfeProvider(TOKEN, true);

      await provider.issue(params());
      expect(JSON.parse(fetchMock.mock.calls[0][1].body).cpf_destinatario).toBeUndefined();

      await provider.issue(params({ recipient: { document: '123.456.789-09', name: 'João' } }));
      const comCliente = JSON.parse(fetchMock.mock.calls[1][1].body);
      expect(comCliente.cpf_destinatario).toBe('12345678909');
      expect(comCliente.nome_destinatario).toBe('João');
    });
  });

  describe('rejeição', () => {
    it('erro de autorização vira FiscalProviderError com a mensagem da SEFAZ', async () => {
      mockFetch([
        {
          status: 400,
          body: { status: 'erro_autorizacao', status_sefaz: '539', mensagem_sefaz: 'Duplicidade de NF-e' },
        },
      ]);

      await expect(new FocusNfeProvider(TOKEN, true).issue(params())).rejects.toMatchObject({
        name: 'FiscalProviderError',
        sefazStatus: '539',
        sefazMessage: 'Duplicidade de NF-e',
      });
    });

    it('junta os erros de validação do Focus numa mensagem acionável', async () => {
      mockFetch([
        {
          status: 422,
          body: {
            status: 'erro_validacao',
            erros: [
              { campo: 'items[0].codigo_ncm', mensagem: 'não pode ficar em branco' },
              { campo: 'cnpj_emitente', mensagem: 'inválido' },
            ],
          },
        },
      ]);

      await expect(new FocusNfeProvider(TOKEN, true).issue(params())).rejects.toThrow(
        'items[0].codigo_ncm: não pode ficar em branco | cnpj_emitente: inválido',
      );
    });

    it('rede fora do ar não vira rejeição fiscal', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;
      await expect(new FocusNfeProvider(TOKEN, true).issue(params())).rejects.toThrow(/Não foi possível falar/);
    });
  });

  describe('processamento assíncrono (NF-e)', () => {
    it('consulta até a SEFAZ concluir e então devolve o resultado', async () => {
      const fetchMock = mockFetch([
        { body: { status: 'processando_autorizacao' } },
        { body: { status: 'processando_autorizacao' } },
        { body: AUTORIZADO },
      ]);

      const result = await new FocusNfeProvider(TOKEN, true).issue(params({ type: 'NFE' }));

      expect(result.accessKey).toBe('3'.repeat(44));
      // 1 POST + 2 consultas.
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(fetchMock.mock.calls[1][0]).toBe('https://homologacao.focusnfe.com.br/v2/nfe/venda-1');
      expect(fetchMock.mock.calls[1][1].method).toBe('GET');
    });
  });

  describe('cancelamento', () => {
    it('recusa justificativa curta antes de gastar uma chamada', async () => {
      const fetchMock = mockFetch([{ body: { status: 'cancelado' } }]);
      // A SEFAZ exige de 15 a 255 caracteres.
      await expect(new FocusNfeProvider(TOKEN, true).cancel('venda-1', '3'.repeat(44), 'curto')).rejects.toThrow(
        /pelo menos 15 caracteres/,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('cancela com DELETE e a justificativa no corpo', async () => {
      const fetchMock = mockFetch([{ body: { status: 'cancelado' } }]);
      const motivo = 'Cliente desistiu da compra no balcão';

      await new FocusNfeProvider(TOKEN, true).cancel('venda-1', '3'.repeat(44), motivo);

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://homologacao.focusnfe.com.br/v2/nfce/venda-1');
      expect(init.method).toBe('DELETE');
      expect(JSON.parse(init.body)).toEqual({ justificativa: motivo });
    });

    it('cancelamento recusado pela SEFAZ vira erro, não sucesso silencioso', async () => {
      mockFetch([{ status: 400, body: { status: 'erro_cancelamento', mensagem_sefaz: 'Prazo de 30 min expirado' } }]);

      await expect(
        new FocusNfeProvider(TOKEN, true).cancel('venda-1', '3'.repeat(44), 'Justificativa suficientemente longa'),
      ).rejects.toThrow('Prazo de 30 min expirado');
    });
  });
});

describe('em que mundo o provedor emite', () => {
  // O aviso da tela de venda saía fixo no código, dizendo "simulada" mesmo
  // quando o provedor real estava ligado em produção. É o único lugar do
  // sistema onde acreditar na tela errada tem consequência fora dele: nota
  // emitida por engano não se desfaz apagando um registro.
  it('homologação se declara homologação', () => {
    expect(new FocusNfeProvider(TOKEN, true).modo()).toBe('homologacao');
  });

  it('produção se declara produção — nunca simulado', () => {
    const modo = new FocusNfeProvider(TOKEN, false).modo();

    expect(modo).toBe('producao');
    // O erro que existia era exatamente este: produção passando por
    // simulação. Dito de novo como asserção, para não voltar.
    expect(modo).not.toBe('simulado');
  });

  it('o simulado se declara simulado', () => {
    expect(new StubFiscalProvider().modo()).toBe('simulado');
  });
});