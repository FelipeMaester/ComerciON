import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { PurchasesController } from './purchases.controller';
import { PurchasesService } from './purchases.service';

// Importa InventoryModule pelo StockService: a entrada de mercadoria move
// estoque pelo MESMO caminho do ajuste manual, e não por um paralelo. Duas
// formas de mexer no saldo é como um dia elas passam a discordar.
@Module({
  imports: [InventoryModule],
  controllers: [PurchasesController],
  providers: [PurchasesService],
})
export class PurchasesModule {}
