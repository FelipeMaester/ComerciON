import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { QueryCustomersDto } from './dto/query-customers.dto';
import { CreateCustomerAddressDto } from './dto/create-customer-address.dto';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CreateCustomerVehicleDto } from './dto/create-customer-vehicle.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomersService } from './customers.service';

@ApiTags('customers')
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.SALES)
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  create(@Body() dto: CreateCustomerDto) {
    return this.customersService.create(dto);
  }

  @Get()
  findAll(@Query() query: QueryCustomersDto) {
    return this.customersService.findAll(query);
  }

  @Get('vehicles/:vehicleId/history')
  getVehicleHistory(@Param('vehicleId') vehicleId: string) {
    return this.customersService.getVehicleHistory(vehicleId);
  }

  // Enxuta de propósito: o PDV chama isto a cada cliente escolhido.
  @Get(':id/credito')
  getCredito(@Param('id') id: string) {
    return this.customersService.getCredito(id);
  }

  @Get(':id/history')
  getCustomerHistory(@Param('id') id: string) {
    return this.customersService.getCustomerHistory(id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.customersService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    return this.customersService.update(id, dto);
  }

  @Patch(':id/activate')
  activate(@Param('id') id: string) {
    return this.customersService.setActive(id, true);
  }

  @Patch(':id/deactivate')
  deactivate(@Param('id') id: string) {
    return this.customersService.setActive(id, false);
  }

  @Post(':id/addresses')
  addAddress(@Param('id') id: string, @Body() dto: CreateCustomerAddressDto) {
    return this.customersService.addAddress(id, dto);
  }

  @Delete(':id/addresses/:addressId')
  removeAddress(@Param('id') id: string, @Param('addressId') addressId: string) {
    return this.customersService.removeAddress(id, addressId);
  }

  @Post(':id/vehicles')
  addVehicle(@Param('id') id: string, @Body() dto: CreateCustomerVehicleDto) {
    return this.customersService.addVehicle(id, dto);
  }
}
