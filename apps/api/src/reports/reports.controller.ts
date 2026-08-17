import { Body, Controller, Get, Param, Put, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { ModuleKey, UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { RequiresModule } from '../common/decorators/requires-module.decorator';
import { dataDaConsulta } from '../common/data-da-consulta';
import { SetGoalDto } from './dto/set-goal.dto';
import { DashboardService } from './dashboard.service';
import { ExportService } from './export.service';

@ApiTags('reports')
@ApiBearerAuth()
// O @RequiresModule(BI) ficava na CLASSE, o que incluía /dashboard — e o
// dashboard é a primeira tela depois do login. Resultado: todo tenant no plano
// Trial entrava no sistema e caía direto num "módulo não incluído no seu
// plano". Saber quanto se vendeu hoje faz parte de vender, não é relatório
// avançado; BI agora protege só a análise (comparativo, metas, exportação).
@Roles(UserRole.ADMIN, UserRole.FINANCE, UserRole.SALES)
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

  @RequiresModule(ModuleKey.BI)
  @Get('compare')
  compare(
    @Query('fromA') fromA: string,
    @Query('toA') toA: string,
    @Query('fromB') fromB: string,
    @Query('toB') toB: string,
  ) {
    return this.dashboardService.comparePeriods(
      dataDaConsulta(fromA, 'fromA'),
      dataDaConsulta(toA, 'toA'),
      dataDaConsulta(fromB, 'fromB'),
      dataDaConsulta(toB, 'toB'),
    );
  }

  @RequiresModule(ModuleKey.BI)
  @Get('goals/:month')
  getGoal(@Param('month') month: string) {
    return this.dashboardService.getGoal(month);
  }

  @Roles(UserRole.ADMIN, UserRole.FINANCE)
  @RequiresModule(ModuleKey.BI)
  @Put('goals/:month')
  setGoal(@Param('month') month: string, @Body() dto: SetGoalDto) {
    return this.dashboardService.setGoal(month, dto.targetAmount);
  }

  @RequiresModule(ModuleKey.BI)
  @Get('sales/export')
  async exportSales(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('format') format: 'csv' | 'pdf' = 'csv',
    @Res() res: Response,
  ) {
    const fromDate = dataDaConsulta(from, 'from');
    const toDate = dataDaConsulta(to, 'to');

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
