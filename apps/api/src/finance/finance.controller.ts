import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FinancialEntryStatus, FinancialEntryType, UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { dataDaConsulta, dataOpcionalDaConsulta, fimDoDiaDaConsulta, fimDoDiaOpcional } from '../common/data-da-consulta';
import { CreateFinancialEntryDto } from './dto/create-financial-entry.dto';
import { FinanceService } from './finance.service';
import { QueryFinanceEntriesDto } from './dto/query-finance-entries.dto';

@ApiTags('finance')
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.FINANCE)
@Controller('finance')
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Post('entries')
  create(@Body() dto: CreateFinancialEntryDto) {
    return this.financeService.create(dto);
  }

  // Um DTO só, e não `@Query() paginacao` ao lado de `@Query('type')` soltos:
  // com forbidNonWhitelisted, parâmetro fora do DTO vira 400. A primeira
  // versão desta paginação derrubou `?type=RECEIVABLE` exatamente assim.
  @Get('entries')
  findAll(@Query() query: QueryFinanceEntriesDto) {
    return this.financeService.findAll(
      query.type,
      query.status,
      dataOpcionalDaConsulta(query.from, 'from'),
      fimDoDiaOpcional(query.to, 'to'),
      query.recorte,
      query,
    );
  }

  @Get('cashflow')
  cashFlow(@Query('from') from: string, @Query('to') to: string) {
    return this.financeService.cashFlow(dataDaConsulta(from, 'from'), fimDoDiaDaConsulta(to, 'to'));
  }

  @Get('entries/:id')
  findOne(@Param('id') id: string) {
    return this.financeService.findOne(id);
  }

  @Patch('entries/:id/pay')
  markPaid(@Param('id') id: string) {
    return this.financeService.markPaid(id);
  }

  @Patch('entries/:id/cancel')
  cancel(@Param('id') id: string) {
    return this.financeService.cancel(id);
  }
}
