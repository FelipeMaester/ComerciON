import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { SettingsService } from './settings.service';

// Personalização da marca (nome, logo, cor) só faz sentido para quem
// administra o tenant — restringimos os dois métodos, não só o de escrita,
// para não expor o formulário a papéis que nem deveriam ver o link no menu.
@ApiTags('settings')
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  getSettings(@CurrentUser() user: AuthenticatedUser) {
    return this.settingsService.getSettings(user.tenantId);
  }

  /**
   * O pedaço das configurações que o BALCÃO precisa.
   *
   * O PDV lia `GET /settings` para saber quanto repassar de taxa de cartão.
   * Como a rota é de ADMIN, o vendedor tomava 403 — e o PDV, que engolia a
   * falha, assumia taxa ZERO. A mesma venda no cartão saía por um valor com
   * o dono no balcão e outro com o vendedor, e ninguém via a diferença: a
   * loja simplesmente absorvia a taxa sem saber.
   *
   * Devolve só as taxas. O resto de /settings (dados da empresa, marca,
   * endereço) continua de quem administra — mesmo motivo pelo qual a logo e
   * a cor viajam no /auth/me em vez de abrirem a tela inteira.
   *
   * A taxa não é segredo: é o acréscimo que o cliente lê no cupom.
   */
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SALES)
  @Get('balcao')
  getBalcao(@CurrentUser() user: AuthenticatedUser) {
    return this.settingsService.getTaxasDeCartao(user.tenantId);
  }

  @Patch()
  updateSettings(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateSettingsDto) {
    return this.settingsService.updateSettings(user.tenantId, dto);
  }
}
