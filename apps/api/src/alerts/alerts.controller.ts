import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { AlertsService } from './alerts.service';

/**
 * Sem @Roles e sem @RequiresModule de propósito.
 *
 * Sem papel: quem atende no balcão é justamente quem precisa saber que a peça
 * acabou. O serviço já filtra por módulo do plano, então ninguém recebe um
 * aviso que não consegue abrir.
 */
@ApiTags('alerts')
@ApiBearerAuth()
@Controller('alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @ApiOperation({ summary: 'O que precisa de atenção hoje nesta loja' })
  @Get()
  listar(@CurrentUser() user: AuthenticatedUser) {
    return this.alertsService.listar(user.tenantId);
  }
}
