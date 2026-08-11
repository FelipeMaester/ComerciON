import { Module } from '@nestjs/common';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';
import { StockCountsController } from './stock-counts.controller';
import { StockCountsService } from './stock-counts.service';
import { WarehousesController } from './warehouses.controller';
import { WarehousesService } from './warehouses.service';

@Module({
  controllers: [WarehousesController, StockController, StockCountsController],
  providers: [WarehousesService, StockService, StockCountsService],
  exports: [StockService],
})
export class InventoryModule {}
