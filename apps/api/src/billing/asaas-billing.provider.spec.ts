import { AsaasBillingProvider } from './asaas-billing.provider';

describe('AsaasBillingProvider', () => {
  let fetchMock: jest.Mock;

  function responder(body: unknown, ok = true, status = 200) {
    return Promise.resolve({ ok, status, text: () => Promise.resolve(JSON.stringify(body)) });
  }

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  const pagador = { nome: 'Oficina do Zé', documento: '12.345.678/0001-95', email: 'ze@oficina.com.br' };
  const base = {
    tenantId: 'tenant-1',
    amount: 199,
    description: 'Assinatura',
    vencimento: new Date('2026-09-10T23:30:00Z'),
    pagador,
  };

  describe('criarCobranca', () => {
    it('cria o pagador e depois a cobrança, devolvendo o link de pagamento', async () => {
      fetchMock
        .mockReturnValueOnce(responder({ id: 'cus_123' }))
        .mockReturnValueOnce(responder({ id: 'pay_999', status: 'PENDING', invoiceUrl: 'https://asaas/f/pay_999' }));

      const resultado = await new AsaasBillingProvider('chave', 'sandbox').criarCobranca(base);

      expect(resultado).toEqual({
        externalId: 'pay_999',
        status: 'PENDING',
        paymentUrl: 'https://asaas/f/pay_999',
        pagadorExternalId: 'cus_123',
      });
    });

    it('não recria o pagador quando já existe', async () => {
      fetchMock.mockReturnValueOnce(responder({ id: 'pay_999', status: 'PENDING' }));

      await new AsaasBillingProvider('chave', 'sandbox').criarCobranca({ ...base, pagadorExternalId: 'cus_ja_existe' });

      // Uma chamada só: a de cobrança. Recriar o cliente a cada mensalidade
      // encheria o provedor de duplicatas e quebraria a conciliação.
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toContain('/payments');
      expect(JSON.parse(fetchMock.mock.calls[0][1].body).customer).toBe('cus_ja_existe');
    });

    it('manda o vencimento como data pura, sem hora nem fuso', async () => {
      fetchMock
        .mockReturnValueOnce(responder({ id: 'cus_123' }))
        .mockReturnValueOnce(responder({ id: 'pay_999', status: 'PENDING' }));

      await new AsaasBillingProvider('chave', 'sandbox').criarCobranca(base);

      // Mandar ISO completo faz a cobrança nascer com vencimento um dia fora
      // dependendo do fuso — erro que só aparece perto da virada do dia.
      expect(JSON.parse(fetchMock.mock.calls[1][1].body).dueDate).toBe('2026-09-10');
    });

    it('manda o CNPJ só com dígitos', async () => {
      fetchMock
        .mockReturnValueOnce(responder({ id: 'cus_123' }))
        .mockReturnValueOnce(responder({ id: 'pay_999', status: 'PENDING' }));

      await new AsaasBillingProvider('chave', 'sandbox').criarCobranca(base);

      expect(JSON.parse(fetchMock.mock.calls[0][1].body).cpfCnpj).toBe('12345678000195');
    });

    it('usa a URL de produção só quando o ambiente é produção', async () => {
      fetchMock.mockReturnValue(responder({ id: 'pay_1', status: 'PENDING' }));

      await new AsaasBillingProvider('chave', 'producao').criarCobranca({ ...base, pagadorExternalId: 'cus_1' });
      // Errar aqui cobraria de verdade quem só queria testar, ou o contrário.
      expect(fetchMock.mock.calls[0][0]).toContain('https://api.asaas.com/v3');

      fetchMock.mockClear();
      await new AsaasBillingProvider('chave', 'sandbox').criarCobranca({ ...base, pagadorExternalId: 'cus_1' });
      expect(fetchMock.mock.calls[0][0]).toContain('https://api-sandbox.asaas.com/v3');
    });

    it('explica o que fazer quando a loja não tem CNPJ, em vez de repassar um 400 cru', async () => {
      const provider = new AsaasBillingProvider('chave', 'sandbox');

      await expect(provider.criarCobranca({ ...base, pagador: { ...pagador, documento: null } })).rejects.toThrow(
        /CNPJ/,
      );
      // E nem chega a chamar o provedor: falhar antes economiza uma ida à
      // rede e evita um cliente pela metade lá.
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('preserva a mensagem de erro do Asaas', async () => {
      fetchMock.mockReturnValueOnce(
        responder({ errors: [{ description: 'O CPF/CNPJ informado é inválido.' }] }, false, 400),
      );

      await expect(new AsaasBillingProvider('chave', 'sandbox').criarCobranca(base)).rejects.toThrow(
        /CPF\/CNPJ informado é inválido/,
      );
    });

    it('cai no boleto quando a fatura não vem', async () => {
      fetchMock.mockReturnValueOnce(
        responder({ id: 'pay_1', status: 'PENDING', bankSlipUrl: 'https://asaas/boleto.pdf' }),
      );

      const r = await new AsaasBillingProvider('chave', 'sandbox').criarCobranca({ ...base, pagadorExternalId: 'c' });
      expect(r.paymentUrl).toBe('https://asaas/boleto.pdf');
    });
  });

  describe('interpretarWebhook', () => {
    const provider = new AsaasBillingProvider('chave', 'sandbox');

    it.each([
      ['PAYMENT_RECEIVED', 'RECEIVED', 'PAID'],
      // CONFIRMED = pago, saldo ainda não liberado. Para liberar o acesso ao
      // sistema vale como pago; esperar a liquidação deixaria o cliente
      // bloqueado depois de já ter pagado.
      ['PAYMENT_CONFIRMED', 'CONFIRMED', 'PAID'],
      ['PAYMENT_OVERDUE', 'OVERDUE', 'FAILED'],
      ['PAYMENT_REFUNDED', 'REFUNDED', 'FAILED'],
    ])('traduz %s', (event, status, esperado) => {
      expect(provider.interpretarWebhook({ event, payment: { id: 'pay_1', status } })).toEqual({
        externalId: 'pay_1',
        status: esperado,
      });
    });

    it('trata cobrança removida como não paga, mesmo sem status utilizável', () => {
      expect(provider.interpretarWebhook({ event: 'PAYMENT_DELETED', payment: { id: 'pay_1' } })).toEqual({
        externalId: 'pay_1',
        status: 'FAILED',
      });
    });

    it('ignora evento que não interessa', () => {
      expect(provider.interpretarWebhook({ event: 'PAYMENT_CREATED', payment: { id: 'pay_1', status: 'PENDING' } })).toBeNull();
      expect(provider.interpretarWebhook({ event: 'TRANSFER_CREATED' })).toBeNull();
    });

    it('ignora payload malformado sem explodir', () => {
      // O corpo vem de fora; um throw aqui viraria 500 e o Asaas reenviaria
      // o mesmo lixo em laço.
      expect(provider.interpretarWebhook(null)).toBeNull();
      expect(provider.interpretarWebhook('texto')).toBeNull();
      expect(provider.interpretarWebhook({ event: 'PAYMENT_RECEIVED' })).toBeNull();
      expect(provider.interpretarWebhook({ event: 'PAYMENT_RECEIVED', payment: { id: 42 } })).toBeNull();
      expect(
        provider.interpretarWebhook({ event: 'PAYMENT_RECEIVED', payment: { id: 'p', status: 'INVENTADO' } }),
      ).toBeNull();
    });
  });
});
