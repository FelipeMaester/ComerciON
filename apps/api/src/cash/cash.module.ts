import { Module } from '@nestjs/common';
import { CashController } from './cash.controller';
import { CashService } from './cash.service';

@Module({
  controllers: [CashController],
  providers: [CashService],
  // Exportado para o SalesService amarrar a venda confirmada ao caixa aberto
  // do operador (ver sales.service.ts).
  exports: [CashService],
})
export class CashModule {}
