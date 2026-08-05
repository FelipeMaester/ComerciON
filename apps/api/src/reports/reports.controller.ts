import { Body, Controller, Get, Param, Put, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { ModuleKey, UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { RequiresModule } from '../common/decorators/requires-module.decorator';
import { SetGoalDto } from './dto/set-goal.dto';
import { DashboardService } from './dashboard.service';
import { ExportService } from './export.service';

@ApiTags('reports')
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.FINANCE, UserRole.SALES)
@RequiresModule(ModuleKey.BI)
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly exportService: ExportService,
  ) {}

  @Get('dashboard')
  getDashboard() {
    return this.dashboardService.getSummary();
  }

  @Get('compare')
  compare(
    @Query('fromA') fromA: string,
    @Query('toA') toA: string,
    @Query('fromB') fromB: string,
    @Query('toB') toB: string,
  ) {
    return this.dashboardService.comparePeriods(new Date(fromA), new Date(toA), new Date(fromB), new Date(toB));
  }

  @Get('goals/:month')
  getGoal(@Param('month') month: string) {
    return this.dashboardService.getGoal(month);
  }

  @Roles(UserRole.ADMIN, UserRole.FINANCE)
  @Put('goals/:month')
  setGoal(@Param('month') month: string, @Body() dto: SetGoalDto) {
    return this.dashboardService.setGoal(month, dto.targetAmount);
  }

  @Get('sales/export')
  async exportSales(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('format') format: 'csv' | 'pdf' = 'csv',
    @Res() res: Response,
  ) {
    const fromDate = new Date(from);
    const toDate = new Date(to);

    if (format === 'pdf') {
      const buffer = await this.exportService.exportSalesPdf(fromDate, toDate);
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="vendas-${from}-a-${to}.pdf"`,
      });
      res.send(buffer);
      return;
    }

    const csv = await this.exportService.exportSalesCsv(fromDate, toDate);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="vendas-${from}-a-${to}.csv"`,
    });
    // BOM UTF-8 na frente: sem isso o Excel abre acentuação corrompida.
    res.send(`﻿${csv}`);
  }
}
