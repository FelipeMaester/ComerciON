import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { BILLING_PROVIDER, BillingProvider } from './billing-provider.interface';
import { AsaasWebhookAuthGuard } from './guards/asaas-webhook-auth.guard';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { SubscribeDto } from './dto/subscribe.dto';
import { TenantModulesService } from '../common/modules/tenant-modules.service';
import { BillingService } from './billing.service';

@ApiTags('billing')
@Controller('billing')
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly tenantModules: TenantModulesService,
    @Inject(BILLING_PROVIDER) private readonly provider: BillingProvider,
  ) {}

  /**
   * Confirmação de pagamento vinda do provedor.
   *
   * Pública porque quem chama é o Asaas, não um usuário — a autenticação é o
   * token do header, conferido pelo guard.
   *
   * Responde 200 mesmo para evento que não interessa: código de erro faz o
   * provedor reenviar em laço, e "não é comigo" não é falha.
   */
  @Public()
  @UseGuards(AsaasWebhookAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('webhook/asaas')
  async webhookAsaas(@Body() payload: unknown) {
    const evento = this.provider.interpretarWebhook(payload);
    if (evento) await this.billingService.aplicarEventoDeCobranca(evento);
    return { received: true };
  }

  // Público: a tela de cadastro self-service (/register) precisa mostrar os
  // planos disponíveis antes de o visitante ter conta/token.
  @Public()
  @Get('plans')
  listPlans() {
    return this.billingService.listPlans();
  }

  /**
   * Módulos liberados para o tenant do usuário logado.
   *
   * Diferente de /subscription, esta rota vale para QUALQUER papel — quem
   * monta o menu é o balconista tanto quanto o dono, e sem isso a sidebar
   * mostraria itens que a API recusa com 403.
   */
  @ApiBearerAuth()
  @Get('my-modules')
  myModules(@CurrentUser() user: AuthenticatedUser) {
    return this.tenantModules.getForTenant(user.tenantId);
  }

  @ApiBearerAuth()
  @Roles(UserRole.ADMIN)
  @Get('subscription')
  getSubscription(@CurrentUser() user: AuthenticatedUser) {
    return this.billingService.getSubscription(user.tenantId);
  }

  @ApiBearerAuth()
  @Roles(UserRole.ADMIN)
  @Post('subscribe')
  subscribe(@CurrentUser() user: AuthenticatedUser, @Body() dto: SubscribeDto) {
    return this.billingService.subscribe(user.tenantId, dto.planKey);
  }
}
