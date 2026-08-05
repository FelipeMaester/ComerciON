import { Module } from '@nestjs/common';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';
import { WarehousesController } from './warehouses.controller';
import { WarehousesService } from './warehouses.service';

@Module({
  controllers: [WarehousesController, StockController],
  providers: [WarehousesService, StockService],
  exports: [StockService],
})
export class InventoryModule {}
