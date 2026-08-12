import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Garante que um job agendado rode UMA vez por disparo, mesmo com várias
 * instâncias da API no ar.
 *
 * O problema concreto: @Cron do @nestjs/schedule agenda dentro do processo.
 * Com duas instâncias, às 6h as duas acordam e as duas cobram a mesma
 * assinatura; às 9h as duas mandam o mesmo WhatsApp. Isso é dinheiro saindo
 * em dobro, e só aparece quando o sistema cresce — que é exatamente quando
 * dói mais.
 *
 * A solução usa advisory lock do próprio Postgres, sem infraestrutura nova:
 * pg_try_advisory_lock devolve na hora se o lock já é de outro, e o lock cai
 * sozinho se a conexão morrer no meio (instância derrubada não deixa o job
 * travado para sempre — que é o defeito clássico de "lock" feito com uma
 * linha numa tabela).
 */
@Injectable()
export class JobLockService {
  private readonly logger = new Logger('JobLockService');

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Roda `work` apenas se conseguir o lock com o nome dado. Se outra
   * instância já estiver rodando, retorna sem executar nada.
   *
   * @returns true se executou, false se outra instância estava com o lock.
   */
  async runExclusively(jobName: string, work: () => Promise<void>): Promise<boolean> {
    const key = this.toLockKey(jobName);

    // O lock é por SESSÃO (conexão), não por transação: precisa ser liberado
    // explicitamente, e por isso o unlock vai no finally.
    const [{ locked }] = await this.prisma.runAsSystem(() =>
      this.prisma.$queryRaw<[{ locked: boolean }]>`SELECT pg_try_advisory_lock(${key}::bigint) AS locked`,
    );

    if (!locked) {
      this.logger.log(`Job "${jobName}" já está rodando em outra instância — pulando neste processo.`);
      return false;
    }

    try {
      await work();
      return true;
    } finally {
      await this.prisma.runAsSystem(() =>
        this.prisma.$queryRaw`SELECT pg_advisory_unlock(${key}::bigint)`,
      );
    }
  }

  /**
   * Advisory lock aceita um bigint, não um texto. Derivamos a chave de um
   * hash do nome para dois jobs diferentes não colidirem por acaso.
   *
   * São 63 bits (não 64) de propósito: bigint do Postgres é COM sinal, e um
   * valor acima de 2^63-1 estoura o tipo em vez de virar negativo.
   */
  private toLockKey(jobName: string): bigint {
    const digest = createHash('sha256').update(jobName).digest();
    return digest.readBigUInt64BE(0) & 0x7fffffffffffffffn;
  }
}
