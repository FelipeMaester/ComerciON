import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ConversationStatus, ModuleKey, UserRole } from '@prisma/client';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RequiresModule } from '../common/decorators/requires-module.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { InboundMessageDto } from './dto/inbound-message.dto';
import { ReplyConversationDto } from './dto/reply-conversation.dto';
import { ConversationsService } from './conversations.service';

// @Roles e @RequiresModule ficam em cada rota individualmente (não na
// classe) porque o webhook é @Public() — nem RolesGuard nem ModulesGuard
// conhecem @Public(), então um decorator de classe bloquearia o webhook
// junto com o resto (já aconteceu com @Roles, corrigido; mesmo cuidado aqui).
@ApiTags('whatsapp')
@Controller('whatsapp')
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  // Endpoint chamado pelo provedor de WhatsApp (webhook) — não leva token de
  // staff/cliente. O tenant é resolvido pelo header x-tenant-slug, igual às
  // outras rotas públicas multi-tenant (ver TenantContextInterceptor).
  @Public()
  @RequiresModule(ModuleKey.WHATSAPP)
  @Post('webhook')
  receiveWebhook(@Body() dto: InboundMessageDto) {
    return this.conversationsService.handleInboundWebhook(dto);
  }

  @ApiBearerAuth()
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  @RequiresModule(ModuleKey.WHATSAPP)
  @Get('conversations')
  list(@Query('status') status?: ConversationStatus) {
    return this.conversationsService.list(status);
  }

  @ApiBearerAuth()
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  @RequiresModule(ModuleKey.WHATSAPP)
  @Get('conversations/:id')
  findOne(@Param('id') id: string) {
    return this.conversationsService.findOne(id);
  }

  @ApiBearerAuth()
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  @RequiresModule(ModuleKey.WHATSAPP)
  @Patch('conversations/:id/assign')
  assign(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.conversationsService.assign(id, user.sub);
  }

  @ApiBearerAuth()
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  @RequiresModule(ModuleKey.WHATSAPP)
  @Patch('conversations/:id/close')
  close(@Param('id') id: string) {
    return this.conversationsService.close(id);
  }

  @ApiBearerAuth()
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  @RequiresModule(ModuleKey.WHATSAPP)
  @Post('conversations/:id/reply')
  reply(@Param('id') id: string, @Body() dto: ReplyConversationDto) {
    return this.conversationsService.reply(id, dto.text);
  }

  @ApiBearerAuth()
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  @RequiresModule(ModuleKey.WHATSAPP)
  @Post('conversations/:id/send-catalog')
  sendCatalog(@Param('id') id: string) {
    return this.conversationsService.sendCatalog(id);
  }
}
