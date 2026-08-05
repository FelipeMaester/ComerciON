import { Module } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { ExportService } from './export.service';
import { ReportsController } from './reports.controller';

@Module({
  controllers: [ReportsController],
  providers: [DashboardService, ExportService],
})
export class ReportsModule {}
