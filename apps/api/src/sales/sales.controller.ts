import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SaleStatus, UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CreateSaleDto } from './dto/create-sale.dto';
import { SalePaymentDto } from './dto/sale-payment.dto';
import { SalesService } from './sales.service';

@ApiTags('sales')
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.SALES)
@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSaleDto) {
    return this.salesService.create(user.sub, dto);
  }

  @Get()
  findAll(@Query('status') status?: SaleStatus, @Query('customerId') customerId?: string) {
    return this.salesService.findAll(status, customerId);
  }

  @Get('commissions')
  commissions(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('sellerId') sellerId?: string,
  ) {
    return this.salesService.commissionReport(from ? new Date(from) : undefined, to ? new Date(to) : undefined, sellerId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.salesService.findOne(id);
  }

  @Post(':id/confirm')
  confirm(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.salesService.confirm(user.sub, id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.salesService.cancel(id);
  }

  @Post(':id/payments')
  registerPayment(@Param('id') id: string, @Body() dto: SalePaymentDto) {
    return this.salesService.registerPayment(id, dto);
  }

  @Post(':id/return')
  returnSale(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.salesService.returnSale(user.sub, id);
  }
}
