import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Esta instância não é a dona do socket desta loja.
 *
 * Mora AQUI, e não junto do socket, por dois motivos. O conceito é de posse.
 * E o prático: o arquivo do socket importa o Baileys, que é ESM e o Jest não
 * consegue parsear — importar o erro de lá quebrava a compilação de todo
 * spec que tocasse o envio de mensagem.
 *
 * Não é erro de operação: é roteamento. Quem recebe isto deixa a mensagem na
 * fila para a instância dona enviar — tentar enviar daqui abriria um socket
 * concorrente, e o WhatsApp derruba a segunda conexão da mesma conta.
 */
export class SessaoDeOutraInstanciaError extends Error {
  constructor(readonly tenantId: string) {
    super(`A sessão de WhatsApp da loja ${tenantId} pertence a outra instância da API`);
    this.name = 'SessaoDeOutraInstanciaError';
  }
}

/**
 * Quanto tempo uma posse vale sem renovação.
 *
 * Este número é o tempo que a loja fica sem WhatsApp quando a instância dona
 * morre: ninguém assume antes de o aluguel vencer. Sessenta segundos é o
 * equilíbrio — curto o bastante para a loja mal notar, longo o bastante para
 * uma pausa de coleta de lixo ou um pico de carga não fazerem duas instâncias
 * disputarem a mesma conta do WhatsApp.
 */
export const VALIDADE_DA_POSSE_MS = 60_000;

/**
 * Renova bem antes de vencer. Com 20s para 60s de validade, dá duas chances
 * de renovar antes de perder a posse por uma consulta lenta.
 */
export const INTERVALO_DE_RENOVACAO_MS = 20_000;

/**
 * Quem está com o socket do WhatsApp de cada loja.
 *
 * O WhatsApp derruba a segunda conexão da mesma conta. Antes, cada instância
 * da API abria socket para TODAS as lojas no boot — com duas instâncias, elas
 * se derrubavam em círculo, e por isso o sistema não podia ter réplica.
 *
 * A posse é um aluguel com prazo, guardado numa tabela, e não um advisory
 * lock: o lock do Postgres é por conexão e o Prisma usa pool, então não há
 * como garantir que a mesma conexão o segure pelas horas em que o socket
 * vive. O aluguel é explícito, dá para conferir com um SELECT, e vence
 * sozinho quando a instância morre.
 */
@Injectable()
export class PosseDaSessaoService {
  private readonly logger = new Logger('PosseDaSessaoService');

  /**
   * Identifica ESTE processo.
   *
   * Gerado na memória, e não lido do hostname: dois contêineres podem ter o
   * mesmo hostname, e o que precisa ser distinguido é o processo — duas
   * instâncias na mesma máquina não podem se achar a mesma.
   */
  readonly instanciaId = randomUUID();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Tenta ficar com a loja. Devolve true se esta instância é a dona agora.
   *
   * O `updateMany` condicional é o que decide, e a condição é a que importa:
   * ou a posse já é minha (renovação), ou está vencida (o dono morreu). Duas
   * instâncias tentando ao mesmo tempo — só uma altera a linha, porque a
   * segunda encontra `expiraEm` já no futuro.
   */
  async tentarAssumir(tenantId: string, agora: Date = new Date()): Promise<boolean> {
    const expiraEm = new Date(agora.getTime() + VALIDADE_DA_POSSE_MS);

    const { count } = await this.prisma.runAsSystem(() =>
      this.prisma.whatsappSessionOwner.updateMany({
        where: {
          tenantId,
          OR: [{ instanciaId: this.instanciaId }, { expiraEm: { lt: agora } }],
        },
        data: { instanciaId: this.instanciaId, expiraEm },
      }),
    );
    if (count > 0) return true;

    // Ninguém tinha a posse ainda. O create pode perder a corrida para outra
    // instância — e perder é a resposta certa, não um erro.
    try {
      await this.prisma.runAsSystem(() =>
        this.prisma.whatsappSessionOwner.create({
          data: { tenantId, instanciaId: this.instanciaId, expiraEm },
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  /** As lojas que ESTA instância tem no momento, com a posse ainda válida. */
  async minhasLojas(agora: Date = new Date()): Promise<string[]> {
    const linhas = await this.prisma.runAsSystem(() =>
      this.prisma.whatsappSessionOwner.findMany({
        where: { instanciaId: this.instanciaId, expiraEm: { gt: agora } },
        select: { tenantId: true },
      }),
    );
    return linhas.map((l) => l.tenantId);
  }

  /**
   * Renova todas as posses desta instância de uma vez.
   *
   * Devolve as lojas que ela PERDEU desde a última renovação — porque a
   * instância travou tempo demais e outra assumiu. Quem chama precisa fechar
   * os sockets dessas, senão volta a existir duas conexões para a mesma conta,
   * que é o defeito inteiro.
   */
  async renovar(comSocketAberto: string[], agora: Date = new Date()): Promise<{ perdidas: string[] }> {
    if (comSocketAberto.length === 0) return { perdidas: [] };

    const expiraEm = new Date(agora.getTime() + VALIDADE_DA_POSSE_MS);
    await this.prisma.runAsSystem(() =>
      this.prisma.whatsappSessionOwner.updateMany({
        where: { tenantId: { in: comSocketAberto }, instanciaId: this.instanciaId },
        data: { expiraEm },
      }),
    );

    const aindaMinhas = new Set(await this.minhasLojas(agora));
    const perdidas = comSocketAberto.filter((t) => !aindaMinhas.has(t));
    if (perdidas.length > 0) {
      this.logger.warn(
        `Perdi a posse de ${perdidas.length} sessão(ões) de WhatsApp — outra instância assumiu. Fechando os sockets daqui.`,
      );
    }
    return { perdidas };
  }

  /** Larga a posse ao desligar, para outra instância assumir na hora. */
  async largar(tenantIds: string[]): Promise<void> {
    if (tenantIds.length === 0) return;
    await this.prisma.runAsSystem(() =>
      this.prisma.whatsappSessionOwner.deleteMany({
        where: { tenantId: { in: tenantIds }, instanciaId: this.instanciaId },
      }),
    );
  }
}
