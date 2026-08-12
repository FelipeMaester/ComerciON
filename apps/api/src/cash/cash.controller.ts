import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ModuleKey, UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequiresModule } from '../common/decorators/requires-module.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CashService } from './cash.service';
import { CashMovementDto, CloseCashSessionDto, OpenCashSessionDto } from './dto/cash.dto';

// Quem opera o balcão precisa abrir e fechar o próprio caixa, então SALES
// entra junto de ADMIN e FINANCE — sem isso o recurso não serviria para
// exatamente as pessoas que mais o usam.
@ApiTags('cash')
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.FINANCE, UserRole.SALES)
@RequiresModule(ModuleKey.SALES)
@Controller('cash')
export class CashController {
  constructor(private readonly cashService: CashService) {}

  /** Caixa aberto do operador logado (ou null). É o que o PDV consulta. */
  @Get('current')
  current(@CurrentUser() user: AuthenticatedUser) {
    return this.cashService.getCurrent(user.sub);
  }

  @Post('open')
  open(@CurrentUser() user: AuthenticatedUser, @Body() dto: OpenCashSessionDto) {
    return this.cashService.open(user.sub, dto);
  }

  @Post('movements')
  addMovement(@CurrentUser() user: AuthenticatedUser, @Body() dto: CashMovementDto) {
    return this.cashService.addMovement(user.sub, dto);
  }

  @Post('close')
  close(@CurrentUser() user: AuthenticatedUser, @Body() dto: CloseCashSessionDto) {
    return this.cashService.close(user.sub, dto);
  }

  // Rota literal antes de :id — o Nest casa na ordem de declaração.
  @Get('sessions')
  findAll(@Query('limit') limit?: string) {
    return this.cashService.findAll(limit ? Number(limit) : undefined);
  }

  @Get('sessions/:id')
  findOne(@Param('id') id: string) {
    return this.cashService.findOne(id);
  }
}
