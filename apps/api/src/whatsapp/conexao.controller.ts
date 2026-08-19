import { Controller, Delete, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { SessaoWhatsappService } from './sessao-whatsapp.service';

/**
 * Conectar o WhatsApp da loja é decisão de dono, não de balconista: a sessão
 * dá acesso à conta inteira, e desconectar derruba o canal de vendas. Daí o
 * @Roles(ADMIN) — diferente da fila de aprovação, que é do dia a dia.
 */
@ApiTags('whatsapp')
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller('whatsapp/conexao')
export class ConexaoController {
  constructor(private readonly sessoes: SessaoWhatsappService) {}

  @ApiOperation({ summary: 'Situação da conexão e, se estiver esperando, o QR Code' })
  @Get()
  estado(@CurrentUser() user: AuthenticatedUser) {
    return this.sessoes.estado(user.tenantId);
  }

  @ApiOperation({ summary: 'Abre a sessão e devolve o QR para leitura' })
  @Post()
  conectar(@CurrentUser() user: AuthenticatedUser) {
    return this.sessoes.conectar(user.tenantId);
  }

  @ApiOperation({ summary: 'Desconecta e apaga as credenciais guardadas' })
  @Delete()
  async desconectar(@CurrentUser() user: AuthenticatedUser) {
    await this.sessoes.desconectar(user.tenantId);
    return { desconectado: true };
  }
}
