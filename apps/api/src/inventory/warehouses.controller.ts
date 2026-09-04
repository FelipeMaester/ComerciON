import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { WarehousesService } from './warehouses.service';

@ApiTags('warehouses')
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.INVENTORY)
@Controller('warehouses')
export class WarehousesController {
  constructor(private readonly warehousesService: WarehousesService) {}

  @Post()
  create(@Body() dto: CreateWarehouseDto) {
    return this.warehousesService.create(dto);
  }

  // LER a lista também é do vendedor. Quem opera o PDV precisa dizer de qual
  // depósito a peça sai — sem isso não existe venda, e era o que acontecia:
  // o 403 chegava calado ao PDV, o seletor ficava vazio, e finalizar a venda
  // respondia "warehouseId must be a UUID" no rosto de quem só queria vender.
  //
  // Só a leitura. Criar e renomear depósito continua sendo de quem cuida do
  // estoque — o vendedor escolhe entre os que existem, não inventa um.
  @Roles(UserRole.ADMIN, UserRole.INVENTORY, UserRole.SALES)
  @Get()
  findAll() {
    return this.warehousesService.findAll();
  }

  @Roles(UserRole.ADMIN, UserRole.INVENTORY, UserRole.SALES)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.warehousesService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateWarehouseDto) {
    return this.warehousesService.update(id, dto);
  }
}
