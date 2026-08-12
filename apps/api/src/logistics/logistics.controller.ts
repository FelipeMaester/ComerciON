import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ModuleKey, UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { RequiresModule } from '../common/decorators/requires-module.decorator';
import { CreateShipmentDto } from './dto/create-shipment.dto';
import { EstimateFreightDto } from './dto/estimate-freight.dto';
import { UpdateShipmentStatusDto } from './dto/update-shipment-status.dto';
import { FreightService } from './freight.service';
import { ShipmentsService } from './shipments.service';

@ApiTags('logistics')
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.INVENTORY, UserRole.SALES)
@RequiresModule(ModuleKey.LOGISTICS)
@Controller('logistics')
export class LogisticsController {
  constructor(
    private readonly shipmentsService: ShipmentsService,
    private readonly freightService: FreightService,
  ) {}

  @Post('freight/estimate')
  estimateFreight(@Body() dto: EstimateFreightDto) {
    return this.freightService.estimateForItems(dto.items, dto.destinationState);
  }

  @Get('dispatch-list')
  dispatchList() {
    return this.shipmentsService.dispatchList();
  }

  @Get('shipments')
  findAllShipments(@Query('includeFinished') includeFinished?: string) {
    return this.shipmentsService.findAll(includeFinished === 'true');
  }

  @Get('shipments/sales/:saleId')
  findBySale(@Param('saleId') saleId: string) {
    return this.shipmentsService.findBySale(saleId);
  }

  @Post('shipments/sales/:saleId')
  create(@Param('saleId') saleId: string, @Body() dto: CreateShipmentDto) {
    return this.shipmentsService.create(saleId, dto.carrier, dto.trackingCode);
  }

  @Patch('shipments/sales/:saleId/status')
  updateStatus(@Param('saleId') saleId: string, @Body() dto: UpdateShipmentStatusDto) {
    return this.shipmentsService.updateStatus(saleId, dto.status, dto.note);
  }
}
