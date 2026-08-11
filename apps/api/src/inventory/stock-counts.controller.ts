import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CreateStockCountDto } from './dto/create-stock-count.dto';
import { UpdateStockCountItemDto } from './dto/update-stock-count-item.dto';
import { StockCountsService } from './stock-counts.service';

@ApiTags('inventory')
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.INVENTORY)
@Controller('inventory/stock-counts')
export class StockCountsController {
  constructor(private readonly stockCountsService: StockCountsService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateStockCountDto) {
    return this.stockCountsService.create(user.sub, dto);
  }

  @Get()
  findAll() {
    return this.stockCountsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.stockCountsService.findOne(id);
  }

  @Patch(':id/items/:itemId')
  setCountedQty(@Param('id') id: string, @Param('itemId') itemId: string, @Body() dto: UpdateStockCountItemDto) {
    return this.stockCountsService.setCountedQty(id, itemId, dto.countedQty);
  }

  @Post(':id/complete')
  complete(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.stockCountsService.complete(id, user.sub);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.stockCountsService.cancel(id);
  }
}
