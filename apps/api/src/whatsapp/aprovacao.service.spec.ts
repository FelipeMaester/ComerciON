import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AprovacaoService } from './aprovacao.service';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappSenderService } from './whatsapp-sender.service';

/**
 * A fila de cobranças esperando autorização.
 *
 * O que estes testes protegem é o que separa "o sistema ajuda a cobrar" de "o
 * sistema cobra sozinho": nada sai sem alguém aprovar, o que sai é o texto que
 * a pessoa leu, e a mesma cobrança não vai duas vezes para o cliente.
 */
describe('AprovacaoService', () => {
  const mensagemNaFila = {
    id: 'msg-1',
    status: 'AGUARDANDO_APROVACAO',
    content: 'Olá, João! Sobre a Bateria 60Ah — R$ 300,00.',
    conversation: { id: 'conv-1', phoneNumber: '5514999990000', customerId: 'cli-1' },
  };

  function montar(overrides: Record<string, unknown> = {}, enviou = true) {
    const prisma = {
      message: {
        findUnique: jest.fn().mockResolvedValue(mensagemNaFila),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      },
      ...overrides,
    };
    const sender = { enviarAutomatico: jest.fn().mockResolvedValue(enviou) };
    const service = new AprovacaoService(
      prisma as unknown as PrismaService,
      sender as unknown as WhatsappSenderService,
    );
    return { service, prisma, sender };
  }

  it('aprovar envia para o telefone da conversa e tira o rascunho da fila', async () => {
    const { service, prisma, sender } = montar();

    await expect(service.aprovar('msg-1')).resolves.toEqual({ enviada: true });

    expect(sender.enviarAutomatico).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '5514999990000', text: mensagemNaFila.content }),
    );
    // O envio cria a mensagem definitiva na conversa; manter o rascunho
    // duplicaria a cobrança no histórico do cliente.
    expect(prisma.message.delete).toHaveBeenCalledWith({ where: { id: 'msg-1' } });
  });

  it('o que vale é o texto editado, não o que o robô escreveu', async () => {
    const { service, sender } = montar();

    await service.aprovar('msg-1', 'Oi João, tudo bem? Passando sobre a bateria.');

    expect(sender.enviarAutomatico).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Oi João, tudo bem? Passando sobre a bateria.' }),
    );
  });

  it('duas pessoas aprovando ao mesmo tempo não mandam a mensagem duas vezes', async () => {
    // A segunda aprovação não encontra mais o status esperado: a reivindicação
    // no banco é o que impede o cliente de receber a mesma cobrança em dobro.
    const { service, sender } = montar({
      message: {
        findUnique: jest.fn().mockResolvedValue(mensagemNaFila),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        delete: jest.fn(),
        update: jest.fn(),
      },
    });

    await expect(service.aprovar('msg-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(sender.enviarAutomatico).not.toHaveBeenCalled();
  });

  it('mensagem já enviada não pode ser aprovada de novo', async () => {
    const { service, sender } = montar({
      message: {
        findUnique: jest.fn().mockResolvedValue({ ...mensagemNaFila, status: 'SENT' }),
        updateMany: jest.fn(),
        delete: jest.fn(),
        update: jest.fn(),
      },
    });

    await expect(service.aprovar('msg-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(sender.enviarAutomatico).not.toHaveBeenCalled();
  });

  it('teto de envio atingido devolve a cobrança para a fila em vez de perdê-la', async () => {
    const { service, prisma } = montar({}, false);

    await expect(service.aprovar('msg-1')).resolves.toMatchObject({ enviada: false });

    expect(prisma.message.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'AGUARDANDO_APROVACAO' } }),
    );
    expect(prisma.message.delete).not.toHaveBeenCalled();
  });

  it('descartar apaga: cobrança recusada não fica no histórico como se tivesse ido', async () => {
    const { service, prisma } = montar();

    await service.descartar('msg-1');
    expect(prisma.message.delete).toHaveBeenCalledWith({ where: { id: 'msg-1' } });
  });

  it('mensagem inexistente é 404, não um envio silencioso', async () => {
    const { service } = montar({
      message: { findUnique: jest.fn().mockResolvedValue(null), updateMany: jest.fn(), delete: jest.fn(), update: jest.fn() },
    });

    await expect(service.aprovar('sumiu')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('a fila traz o cliente junto — aprovar sem saber para quem é assinar em branco', async () => {
    const { service, prisma } = montar();

    await service.listar();

    expect(prisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'AGUARDANDO_APROVACAO' },
        include: { conversation: { include: { customer: true } } },
      }),
    );
  });
});

/**
 * Quando o provedor recusa.
 *
 * Aconteceu de verdade na primeira tentativa: o Twilio devolveu 422 ("conta de
 * teste só entrega para número verificado"), a API respondeu "Erro interno" e
 * a cobrança ficou presa em QUEUED — fora da fila de aprovação e nunca
 * enviada. A loja acharia que cobrou; o cliente nunca receberia nada.
 */
describe('AprovacaoService — quando o envio falha', () => {
  const naFila = {
    id: 'msg-1',
    status: 'AGUARDANDO_APROVACAO',
    content: 'Olá!',
    conversation: { id: 'conv-1', phoneNumber: '5514999990000', customerId: 'cli-1' },
  };

  function montar(erroDoProvedor: Error) {
    const prisma = {
      message: {
        findUnique: jest.fn().mockResolvedValue(naFila),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn(),
      },
    };
    const sender = { enviarAutomatico: jest.fn().mockRejectedValue(erroDoProvedor) };
    const service = new AprovacaoService(
      prisma as unknown as PrismaService,
      sender as unknown as WhatsappSenderService,
    );
    return { service, prisma };
  }

  it('a cobrança volta para a fila — nunca fica presa num estado morto', async () => {
    const { service, prisma } = montar(new Error('Request failed with status code 422'));

    const resultado = await service.aprovar('msg-1');

    expect(resultado.enviada).toBe(false);
    expect(prisma.message.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'AGUARDANDO_APROVACAO' } }),
    );
    // E não apaga: cobrança que não saiu precisa continuar existindo.
    expect(prisma.message.delete).not.toHaveBeenCalled();
  });

  it('explica a recusa da conta de teste em vez de dizer "erro interno"', async () => {
    const { service } = montar(
      new Error("No Twilio trial phone number is assigned for messaging to this destination number. Please add the 'to' number as a verified recipient."),
    );

    const { motivo } = await service.aprovar('msg-1');

    expect(motivo).toContain('modo de teste');
    expect(motivo).toContain('números verificados');
    // Nada de "Erro interno": o sistema não quebrou, o provedor recusou.
    expect(motivo).not.toMatch(/erro interno/i);
  });

  it('recusa desconhecida ainda diz o que o provedor respondeu', async () => {
    const { service } = montar(new Error('Alguma coisa muito específica do provedor'));

    const { motivo } = await service.aprovar('msg-1');
    expect(motivo).toContain('Alguma coisa muito específica do provedor');
  });
});
