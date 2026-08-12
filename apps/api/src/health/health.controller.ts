import { Controller, Get, HttpStatus, Logger, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

/** Depois disto, consideramos o banco inacessível. */
const DB_TIMEOUT_MS = 3000;

interface CheckResult {
  ok: boolean;
  latencyMs: number;
  error?: string;
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  private readonly logger = new Logger('Health');
  private readonly startedAt = Date.now();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * "O processo está vivo?" — não toca no banco de propósito.
   *
   * É esta que o Docker usa para decidir reiniciar o container. Se o
   * liveness dependesse do banco, uma queda do Postgres colocaria a API num
   * ciclo de reinício sem fim: reiniciar não conserta banco fora do ar, só
   * apaga o estado em memória e atrasa a recuperação quando ele voltar.
   */
  @Public()
  @Get('live')
  @ApiOperation({ summary: 'O processo respondeu. Não verifica dependências.' })
  live() {
    return { status: 'ok', uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000) };
  }

  /**
   * "Dá para atender requisição de verdade?" — verifica as dependências.
   *
   * É esta que o monitoramento externo deve observar. Responde 503 quando
   * alguma dependência está fora, com o detalhe de qual e por quê.
   */
  @Public()
  @Get()
  @ApiOperation({ summary: 'Pronto para atender: verifica o banco.' })
  async ready(@Res({ passthrough: true }) res: Response) {
    const database = await this.checkDatabase();
    const healthy = database.ok;

    // 503, não 500: "estou fora temporariamente" é informação diferente de
    // "quebrei". Monitor e balanceador tratam os dois de formas distintas.
    res.status(healthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);

    if (!healthy) {
      this.logger.error(`Health check reprovado: banco — ${database.error}`);
    }

    return {
      status: healthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      checks: { database },
    };
  }

  private async checkDatabase(): Promise<CheckResult> {
    const started = Date.now();
    try {
      // O timeout é o ponto principal desta reescrita. Sem ele, com o banco
      // inacessível (não recusando conexão — inacessível), a consulta fica
      // pendurada e o health check nunca responde. Monitor nenhum consegue
      // distinguir "lento" de "morto" quando a resposta simplesmente não vem.
      await Promise.race([
        this.prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`sem resposta em ${DB_TIMEOUT_MS}ms`)), DB_TIMEOUT_MS),
        ),
      ]);
      return { ok: true, latencyMs: Date.now() - started };
    } catch (error) {
      return { ok: false, latencyMs: Date.now() - started, error: (error as Error).message };
    }
  }
}
