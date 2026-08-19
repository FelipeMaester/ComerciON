import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappSenderService } from './whatsapp-sender.service';

/**
 * A fila de cobranças escritas pelo sistema, esperando a loja autorizar.
 *
 * O que resolve: cobrança automática que sai sozinha assusta — uma mensagem
 * errada vai para o cliente e não volta. Cobrança 100% manual não acontece —
 * ninguém para o balcão para redigir quinze mensagens. Aqui o sistema faz a
 * parte chata (quem deve, quanto, de quê, e o texto pronto) e a pessoa faz a
 * parte que exige julgamento: olhar e decidir.
 *
 * Aprovar envia de verdade e a mensagem vira parte da conversa. Descartar
 * apaga: uma cobrança recusada não deve ficar no histórico do cliente como se
 * tivesse sido enviada.
 */
@Injectable()
export class AprovacaoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sender: WhatsappSenderService,
  ) {}

  /**
   * O que está esperando decisão, com o contexto para decidir.
   *
   * Traz a conversa e o cliente juntos: aprovar uma cobrança sem saber para
   * quem é, e sem ver se a pessoa já respondeu alguma coisa, é assinar em
   * branco.
   */
  async listar() {
    return this.prisma.message.findMany({
      where: { status: 'AGUARDANDO_APROVACAO' },
      include: { conversation: { include: { customer: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async contar(): Promise<number> {
    return this.prisma.message.count({ where: { status: 'AGUARDANDO_APROVACAO' } });
  }

  /**
   * Autoriza e envia.
   *
   * O texto pode ter sido editado antes de aprovar — é comum a pessoa querer
   * ajustar uma palavra —, então o que vale é o que chega aqui, não o que foi
   * escrito pelo robô.
   */
  async aprovar(id: string, textoEditado?: string) {
    const mensagem = await this.prisma.message.findUnique({
      where: { id },
      include: { conversation: true },
    });
    if (!mensagem) throw new NotFoundException('Mensagem não encontrada');
    if (mensagem.status !== 'AGUARDANDO_APROVACAO') {
      // Duas pessoas aprovando a mesma cobrança ao mesmo tempo mandariam a
      // mensagem duas vezes para o cliente.
      throw new BadRequestException('Esta mensagem já foi enviada ou descartada');
    }

    const texto = (textoEditado ?? mensagem.content).trim();
    if (!texto) throw new BadRequestException('A mensagem não pode ficar vazia');

    // Reivindica antes de enviar: se outra aprovação chegar no meio, ela já
    // não encontra o status esperado e para no erro acima.
    const reivindicada = await this.prisma.message.updateMany({
      where: { id, status: 'AGUARDANDO_APROVACAO' },
      data: { status: 'QUEUED', content: texto },
    });
    if (reivindicada.count === 0) {
      throw new BadRequestException('Esta mensagem já foi enviada ou descartada');
    }

    /**
     * A partir daqui, nada pode deixar a cobrança presa.
     *
     * A reivindicação acima tirou a mensagem da fila. Se o envio falhar e ela
     * ficar em QUEUED, some da tela de aprovação e nunca é enviada — a loja
     * acha que cobrou e o cliente nunca recebeu nada. Foi o que aconteceu na
     * primeira tentativa real: o Twilio recusou (conta de teste só envia para
     * número verificado), a tela mostrou "Erro interno" e a cobrança evaporou.
     */
    try {
      const enviou = await this.sender.enviarAutomatico({
        phone: mensagem.conversation.phoneNumber,
        text: texto,
        customerId: mensagem.conversation.customerId ?? undefined,
      });

      // O envio cria a mensagem definitiva na conversa; esta era o rascunho.
      // Mantê-la duplicaria a cobrança no histórico do cliente.
      if (enviou) {
        await this.prisma.message.delete({ where: { id } });
        return { enviada: true };
      }

      await this.devolverParaFila(id);
      return { enviada: false, motivo: 'Teto de mensagens automáticas da loja atingido nas últimas 24h.' };
    } catch (erro) {
      await this.devolverParaFila(id);
      return { enviada: false, motivo: this.motivoLegivel(erro) };
    }
  }

  /** A cobrança volta a esperar decisão — nunca fica presa num estado morto. */
  private async devolverParaFila(id: string) {
    await this.prisma.message.update({
      where: { id },
      data: { status: 'AGUARDANDO_APROVACAO' } as Prisma.MessageUncheckedUpdateInput,
    });
  }

  /**
   * Traduz a recusa do provedor para algo acionável.
   *
   * O erro cru do Twilio é em inglês e fala de "verified recipient" — quem
   * está no balcão não sabe o que fazer com isso. E o filtro genérico da API
   * transformava tudo em "Erro interno", que é pior ainda: dá a entender que o
   * sistema quebrou, quando o que houve foi o provedor recusar por uma regra
   * dele.
   *
   * O texto original vai junto entre parênteses — é o que o suporte precisa.
   */
  private motivoLegivel(erro: unknown): string {
    const bruto = erro instanceof Error ? erro.message : String(erro);

    // Conta de teste do Twilio: só entrega para número previamente verificado.
    if (/trial|verified recipient/i.test(bruto)) {
      return (
        'O provedor recusou: a conta do WhatsApp está em modo de teste e só entrega para números verificados. ' +
        'Cadastre este número como destinatário verificado no painel do provedor, ou saia do modo de teste.'
      );
    }

    // Fora da janela de 24h: a Meta exige template aprovado para iniciar conversa.
    if (/template|24|session|freeform/i.test(bruto)) {
      return (
        'O provedor recusou: o WhatsApp só permite iniciar conversa com um modelo de mensagem aprovado. ' +
        'Este cliente precisa ter respondido nas últimas 24h, ou a loja precisa de um template aprovado.'
      );
    }

    return `O provedor recusou o envio (${bruto.slice(0, 160)}).`;
  }

  async descartar(id: string) {
    const mensagem = await this.prisma.message.findUnique({ where: { id } });
    if (!mensagem) throw new NotFoundException('Mensagem não encontrada');
    if (mensagem.status !== 'AGUARDANDO_APROVACAO') {
      throw new BadRequestException('Esta mensagem já foi enviada ou descartada');
    }
    await this.prisma.message.delete({ where: { id } });
  }
}
