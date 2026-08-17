import { Body, Controller, Get, HttpStatus, Logger, Post, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { EnviarEmailDeTesteDto } from './dto/enviar-email-de-teste.dto';
import { Public } from '../common/decorators/public.decorator';
import { MailService } from '../mail/mail.service';
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

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

  /**
   * "O e-mail está saindo?" — separado do /health de propósito.
   *
   * E-mail fora do ar não é o sistema fora do ar: as vendas continuam, o PDV
   * continua. Se isso derrubasse o health check principal, o monitoramento
   * gritaria "aplicação caiu" por causa de um SMTP intermitente, e em pouco
   * tempo ninguém olharia mais o alarme.
   *
   * Mas também não pode ficar invisível: o "esqueci minha senha" responde 200
   * de qualquer jeito (para não revelar quais e-mails existem no sistema) e o
   * erro fica só no log. Sem esta rota, a primeira notícia de que o e-mail
   * parou vem de alguém que não conseguiu entrar.
   */
  @Public()
  // Cada chamada abre conexão com o servidor SMTP. O limite existe para esta
  // rota não virar um jeito de martelar o provedor de e-mail de fora.
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @Get('mail')
  @ApiOperation({ summary: 'Conexão e credenciais do envio de e-mail.' })
  async mailHealth(@Res({ passthrough: true }) res: Response) {
    const diagnostico = await this.mail.diagnosticar();

    res.status(diagnostico.ok ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    if (!diagnostico.ok) {
      this.logger.error(`Envio de e-mail indisponível: ${diagnostico.detalhe}`);
    }

    return { status: diagnostico.ok ? 'ok' : 'degraded', ...diagnostico };
  }

  /**
   * Manda um e-mail de teste para um endereço à sua escolha.
   *
   * O health check acima prova que o servidor SMTP aceita a conexão e as
   * credenciais. Não prova ENTREGA: sem SPF/DKIM configurados no DNS, a
   * mensagem sai daqui com sucesso e é recusada ou jogada em spam do outro
   * lado. A única forma de saber é olhar uma caixa de entrada de verdade.
   *
   * Restrito ao super-admin: é uma rota que faz o servidor mandar e-mail para
   * um endereço arbitrário, e aberta viraria ferramenta de spam de terceiro.
   */
  @Roles(UserRole.SUPER_ADMIN)
  @Throttle({ default: { limit: 5, ttl: 300_000 } })
  @Post('mail/test')
  @ApiOperation({ summary: 'Envia um e-mail de teste (super-admin)' })
  async enviarTeste(@Body() dto: EnviarEmailDeTesteDto) {
    await this.mail.enviarTeste(dto.para);
    return {
      enviado: true,
      para: dto.para,
      aviso:
        'Enviado sem erro. Confira a caixa de entrada E a pasta de spam: ' +
        'cair em spam significa SPF/DKIM faltando no DNS, não falha de envio.',
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
