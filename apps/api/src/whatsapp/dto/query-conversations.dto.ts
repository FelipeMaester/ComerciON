import { ApiPropertyOptional } from '@nestjs/swagger';
import { ConversationStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination.dto';

/**
 * Filtros do Inbox.
 *
 * O `status` PRECISA estar aqui, e não continuar como `@Query('status')`
 * solto: assim que a rota passa a receber um DTO, o ValidationPipe roda com
 * forbidNonWhitelisted e todo parâmetro não declarado vira 400. A tela já
 * filtra por situação — sem esta linha, o filtro que funcionava passaria a
 * responder erro. Foi exatamente assim que a tela do financeiro quebrou.
 */
export class QueryConversationsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ConversationStatus })
  @IsOptional()
  @IsEnum(ConversationStatus)
  status?: ConversationStatus;

  @ApiPropertyOptional({ description: 'Telefone ou nome do cliente' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}
