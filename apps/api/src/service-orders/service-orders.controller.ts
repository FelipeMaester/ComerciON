import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { ScheduleServiceOrderDto } from './dto/schedule-service-order.dto';
import { UpdateServiceOrderStatusDto } from './dto/update-service-order-status.dto';
import { ServiceOrdersService } from './service-orders.service';

@ApiTags('service-orders')
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.SALES)
@Controller('service-orders')
export class ServiceOrdersController {
  constructor(private readonly serviceOrdersService: ServiceOrdersService) {}

  @Get()
  findAll() {
    return this.serviceOrdersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.serviceOrdersService.findOne(id);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateServiceOrderStatusDto) {
    return this.serviceOrdersService.updateStatus(id, dto.status);
  }

  @Patch(':id/schedule')
  schedule(@Param('id') id: string, @Body() dto: ScheduleServiceOrderDto) {
    return this.serviceOrdersService.schedule(id, dto.scheduledAt);
  }
}
