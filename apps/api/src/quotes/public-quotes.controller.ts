import { Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { QuotesService } from './quotes.service';

/**
 * Aprovação de orçamento pelo cliente, por link.
 *
 * Controller separado do QuotesController de propósito: aquele é
 * @Roles(ADMIN, SALES) na classe inteira, e misturar rotas públicas ali
 * deixaria a fronteira de segurança dependendo de um decorator por método.
 * Aqui é explícito — tudo neste arquivo é público.
 *
 * A proteção é o token: um UUID por orçamento, que só quem recebeu o link
 * conhece. O tenant vem do header x-tenant-slug, como em qualquer rota
 * pública (o slug não é segredo; o token é).
 *
 * Estas rotas viviam no módulo da loja virtual. Vieram para cá quando a loja
 * foi removida: aprovar orçamento é fluxo de oficina, não de e-commerce —
 * só estava hospedado lá por acidente de história.
 */
@ApiTags('orçamento público')
@Controller('public/quotes')
export class PublicQuotesController {
  constructor(private readonly quotesService: QuotesService) {}

  // Limite por IP: são rotas públicas e o token, embora improvável de
  // adivinhar, não deveria ser tentável em massa.
  @Public()
  @Throttle({ default: { limit: 30, ttl: 900_000 } })
  @Get(':token')
  @ApiOperation({ summary: 'Ver o orçamento pelo link recebido' })
  find(@Param('token') token: string) {
    return this.quotesService.findByPublicToken(token);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 900_000 } })
  @HttpCode(HttpStatus.OK)
  @Post(':token/approve')
  @ApiOperation({ summary: 'Aprovar — gera a Ordem de Serviço automaticamente' })
  approve(@Param('token') token: string) {
    return this.quotesService.approveByToken(token);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 900_000 } })
  @HttpCode(HttpStatus.OK)
  @Post(':token/reject')
  reject(@Param('token') token: string) {
    return this.quotesService.rejectByToken(token);
  }
}
