import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { PaginationQueryDto } from '../common/pagination/pagination.dto';
import { CreateStockCountDto } from './dto/create-stock-count.dto';
import { QueryStockCountItemsDto } from './dto/query-stock-count-items.dto';
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
  findAll(@Query() query: PaginationQueryDto) {
    return this.stockCountsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.stockCountsService.findOne(id);
  }

  // Rota separada da ficha de propósito: a ficha é pequena e a tela lê uma vez;
  // os itens são milhares e a tela lê aos poucos, conforme a pessoa avança.
  @Get(':id/items')
  @ApiOperation({ summary: 'Itens da contagem, paginados e filtrados por situação/busca' })
  findItems(@Param('id') id: string, @Query() query: QueryStockCountItemsDto) {
    return this.stockCountsService.findItems(id, query);
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
