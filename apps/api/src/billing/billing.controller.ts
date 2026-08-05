import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { SubscribeDto } from './dto/subscribe.dto';
import { BillingService } from './billing.service';

@ApiTags('billing')
@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  // Público: a tela de cadastro self-service (/register) precisa mostrar os
  // planos disponíveis antes de o visitante ter conta/token.
  @Public()
  @Get('plans')
  listPlans() {
    return this.billingService.listPlans();
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
