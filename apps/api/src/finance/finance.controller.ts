import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FinancialEntryStatus, FinancialEntryType, UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateFinancialEntryDto } from './dto/create-financial-entry.dto';
import { FinanceService } from './finance.service';

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

  @Get('entries')
  findAll(
    @Query('type') type?: FinancialEntryType,
    @Query('status') status?: FinancialEntryStatus,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.financeService.findAll(type, status, from ? new Date(from) : undefined, to ? new Date(to) : undefined);
  }

  @Get('cashflow')
  cashFlow(@Query('from') from: string, @Query('to') to: string) {
    return this.financeService.cashFlow(new Date(from), new Date(to));
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
