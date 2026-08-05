import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { TransferStockDto } from './dto/transfer-stock.dto';
import { StockService } from './stock.service';

@ApiTags('inventory')
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.INVENTORY)
@Controller('inventory/stock')
export class StockController {
  constructor(private readonly stockService: StockService) {}

  @Get('products/:productId')
  listForProduct(@Param('productId') productId: string) {
    return this.stockService.listForProduct(productId);
  }

  @Get('products/:productId/movements')
  movements(@Param('productId') productId: string) {
    return this.stockService.movements(productId);
  }

  @Post('adjust')
  adjust(@CurrentUser() user: AuthenticatedUser, @Body() dto: AdjustStockDto) {
    return this.stockService.adjust(user.sub, dto);
  }

  @Post('transfer')
  transfer(@CurrentUser() user: AuthenticatedUser, @Body() dto: TransferStockDto) {
    return this.stockService.transfer(user.sub, dto);
  }
}
