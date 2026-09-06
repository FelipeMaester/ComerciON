import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { PaginationQueryDto } from '../common/pagination/pagination.dto';
import { CreatePurchaseEntryDto } from './dto/create-purchase-entry.dto';
import { ConfirmPurchaseEntryDto } from './dto/confirm-purchase-entry.dto';
import { PurchasesService } from './purchases.service';

// Quem recebe mercadoria é quem cuida do estoque — e o dono. Vendas não entra:
// dar entrada mexe no custo, e o custo é o que decide a margem da loja.
@ApiTags('compras')
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.INVENTORY)
@Controller('purchase-entries')
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @Post()
  @ApiOperation({ summary: 'Lança uma entrada de mercadoria (nota do fornecedor)' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePurchaseEntryDto) {
    return this.purchasesService.create(user.sub, dto);
  }

  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.purchasesService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.purchasesService.findOne(id);
  }

  @Patch(':id/confirm')
  @ApiOperation({ summary: 'Dá entrada no estoque e atualiza o custo das peças' })
  confirm(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ConfirmPurchaseEntryDto,
  ) {
    return this.purchasesService.confirm(user.sub, id, dto.gerarContaAPagar, dto.dueDate);
  }

  @Patch(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.purchasesService.cancel(id);
  }
}
