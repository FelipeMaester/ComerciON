import { Controller, Get, HttpStatus, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public } from '../decorators/public.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { slugDoHost } from './slug-do-host';

/**
 * Porteiro do certificado.
 *
 * Com um domínio curinga apontando para o servidor, o Caddy passa a emitir
 * certificado sob demanda para QUALQUER nome que chegue. Sem alguém dizendo
 * "este endereço é de uma loja de verdade", basta apontar mil subdomínios
 * inventados para o IP e a conta bate no limite da Let's Encrypt — e aí nem
 * as lojas reais conseguem renovar. Esta rota é o `ask` do Caddy: 200 emite,
 * qualquer outra coisa recusa.
 *
 * Responde só sim/não. Não devolve nome, plano nem nada do tenant: é uma rota
 * aberta, e transformá-la em consulta de "quais lojas existem" seria entregar
 * a lista de clientes a quem quisesse varrer nomes.
 */
@ApiTags('infra')
@Controller('tenant-hosts')
export class TenantHostsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  // O Caddy consulta uma vez por certificado novo, não por requisição. Um
  // teto generoso ainda corta a varredura de nomes em massa.
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Diz se um endereço pertence a uma loja (usado pelo Caddy para emitir certificado)' })
  @Get('check')
  async check(@Query('domain') domain: string | undefined, @Res() res: Response) {
    const base = this.config.get<string>('TENANT_BASE_DOMAIN');
    const slug = slugDoHost(domain, base);

    if (!slug) {
      // Inclui o domínio-base puro e os fixos (painel, api, monitor): esses
      // têm certificado próprio, declarado no Caddyfile, e não passam por aqui.
      return res.status(HttpStatus.NOT_FOUND).send();
    }

    const existe = await this.prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
    return res.status(existe ? HttpStatus.OK : HttpStatus.NOT_FOUND).send();
  }
}
