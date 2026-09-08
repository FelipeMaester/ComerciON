import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { MessageStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PosseDaSessaoService } from './posse-da-sessao.service';
import { ENVIADOR_DE_SESSAO, type EnviadorDeSessao } from './enviador-de-sessao';

/** De quanto em quanto tempo a instância dona olha a fila. */
export const INTERVALO_DA_FILA_MS = 3_000;

/**
 * Quantas mensagens sair por rodada.
 *
 * Existe para uma fila que acumulou (a instância dona caiu por uma hora) não
 * virar uma rajada de centenas de mensagens de uma vez — o WhatsApp trata
 * isso como comportamento de robô e derruba a conta da loja.
 */
export const MAXIMO_POR_RODADA = 20;

/**
 * Envia o que ficou na fila.
 *
 * Existe porque o socket do WhatsApp de cada loja mora em UMA instância da
 * API: o WhatsApp derruba a segunda conexão da mesma conta. Numa instalação
 * com réplicas, a requisição que pede o envio quase sempre cai numa instância
 * que não é a dona daquela loja — ela grava a mensagem como QUEUED, e quem
 * tem o socket a envia daqui.
 *
 * De quebra, isto conserta uma ordem que estava invertida: antes o sistema
 * mandava a mensagem PRIMEIRO e registrava depois. Se o processo morresse no
 * meio, o cliente recebia uma mensagem que a loja não tinha registro de ter
 * mandado. Agora grava primeiro; o pior caso passou a ser uma mensagem
 * registrada e ainda não entregue, que é visível e se resolve sozinha.
 */
@Injectable()
export class FilaDeEnvioService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('FilaDeEnvioService');
  private relogio?: NodeJS.Timeout;
  /** Trava simples: uma rodada por vez dentro deste processo. */
  private rodando = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly posse: PosseDaSessaoService,
    @Inject(ENVIADOR_DE_SESSAO) private readonly sessoes: EnviadorDeSessao,
  ) {}

  onModuleInit() {
    this.relogio = setInterval(() => {
      this.rodada().catch((erro) => this.logger.error('Falha ao esvaziar a fila de envio', erro as Error));
    }, INTERVALO_DA_FILA_MS);
    this.relogio.unref();
  }

  onModuleDestroy() {
    if (this.relogio) clearInterval(this.relogio);
  }

  /**
   * Uma passada pela fila das lojas que ESTA instância possui.
   *
   * Só as minhas: mandar mensagem de uma loja que é de outra instância
   * abriria um socket concorrente, que é o defeito que a posse resolve.
   */
  async rodada(): Promise<{ enviadas: number; falhas: number }> {
    if (this.rodando) return { enviadas: 0, falhas: 0 };
    this.rodando = true;
    try {
      const minhas = await this.posse.minhasLojas();
      if (minhas.length === 0) return { enviadas: 0, falhas: 0 };

      const pendentes = await this.prisma.runAsSystem(() =>
        this.prisma.message.findMany({
          where: {
            tenantId: { in: minhas },
            status: MessageStatus.QUEUED,
            direction: 'OUTBOUND',
          },
          // Ordem de chegada: uma conversa é uma sequência, e mensagem fora de
          // ordem no WhatsApp do cliente é pior que mensagem atrasada.
          orderBy: { createdAt: 'asc' },
          take: MAXIMO_POR_RODADA,
          select: {
            id: true,
            tenantId: true,
            content: true,
            conversation: { select: { phoneNumber: true } },
          },
        }),
      );

      let enviadas = 0;
      let falhas = 0;
      for (const mensagem of pendentes) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const { externalId } = await this.sessoes.enviar(
            mensagem.tenantId,
            mensagem.conversation.phoneNumber,
            mensagem.content,
          );
          // eslint-disable-next-line no-await-in-loop
          await this.prisma.runAsSystem(() =>
            this.prisma.message.update({
              where: { id: mensagem.id },
              data: { status: MessageStatus.SENT, externalId },
            }),
          );
          enviadas++;
        } catch (erro) {
          falhas++;
          // A mensagem FICA na fila: a causa mais comum é o WhatsApp da loja
          // desconectado, e isso se resolve sozinho quando alguém reconecta.
          // Marcar como falha aqui perderia a mensagem sem ninguém pedir.
          this.logger.warn(
            `Mensagem ${mensagem.id} continua na fila: ${(erro as Error).message}`,
          );
        }
      }
      return { enviadas, falhas };
    } finally {
      this.rodando = false;
    }
  }
}
