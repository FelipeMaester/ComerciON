import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ModuleKey, UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequiresModule } from '../common/decorators/requires-module.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { AiService } from './ai.service';
import { SendMessageDto } from './dto/send-message.dto';

@ApiTags('ai')
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.SALES, UserRole.FINANCE)
@RequiresModule(ModuleKey.AI)
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  // Histórico é pessoal — cada membro da equipe vê só as próprias conversas
  // com o assistente, não um inbox compartilhado.
  @Get('conversations')
  listConversations(@CurrentUser() user: AuthenticatedUser) {
    return this.aiService.listConversations(user.sub);
  }

  @Get('conversations/:id')
  getConversation(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.aiService.getConversation(user.sub, id);
  }

  @Post('messages')
  sendMessage(@CurrentUser() user: AuthenticatedUser, @Body() dto: SendMessageDto) {
    return this.aiService.sendMessage(user.sub, dto.conversationId, dto.message);
  }
}
