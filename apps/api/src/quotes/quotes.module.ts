import { Module } from '@nestjs/common';
import { PublicQuotesController } from './public-quotes.controller';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';

@Module({
  controllers: [QuotesController, PublicQuotesController],
  providers: [QuotesService],
  exports: [QuotesService],
})
export class QuotesModule {}
