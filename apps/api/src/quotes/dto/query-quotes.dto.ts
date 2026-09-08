import { ApiPropertyOptional } from '@nestjs/swagger';
import { QuoteStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination.dto';

/**
 * Filtros da lista de orçamentos.
 *
 * A tela já tinha o botão "só os agendados" e ele filtrava no navegador, sobre
 * a lista inteira. Filtro de tela sobre lista paginada é uma mentira: passaria
 * a mostrar "os agendados desta página", que não é o que ninguém quer saber.
 * Por isso ele vem para cá junto com a paginação, e não depois.
 */
export class QueryQuotesDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: QuoteStatus })
  @IsOptional()
  @IsEnum(QuoteStatus)
  status?: QuoteStatus;

  @ApiPropertyOptional({ description: 'Só os que já têm serviço agendado, do mais próximo ao mais distante' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  agenda?: boolean;

  @ApiPropertyOptional({ description: 'Nome do cliente ou placa do veículo' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}

/**
 * "O que foi aprovado desde a última vez que perguntei."
 *
 * A tela precisa avisar na hora que um cliente aprovou pelo link — e fazia
 * isso baixando TODOS os orçamentos a cada 15 segundos para comparar com a
 * cópia anterior. Com 3.000 orçamentos eram 1,6 MB por consulta, 6,4 MB por
 * minuto de aba aberta, para descobrir um "sim" que cabe numa linha.
 *
 * Perguntar pela data também é mais correto que comparar listas: o aviso não
 * depende mais de o orçamento estar na página que a tela tem em mãos.
 */
export class QuotesAprovadosDesdeDto {
  @ApiPropertyOptional({ description: 'Momento da última consulta, em ISO 8601' })
  @IsOptional()
  @IsISO8601()
  desde?: string;
}
