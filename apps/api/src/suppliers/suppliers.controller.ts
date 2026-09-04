import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { LinkSupplierProductDto } from './dto/link-product.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { SuppliersService } from './suppliers.service';

@ApiTags('suppliers')
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.INVENTORY)
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Post()
  create(@Body() dto: CreateSupplierDto) {
    return this.suppliersService.create(dto);
  }

  // Mesmo motivo dos clientes: quem lança uma conta a pagar precisa dizer a
  // qual fornecedor ela pertence. Só a leitura da lista — cadastrar e editar
  // fornecedor continua de quem cuida do estoque.
  @Roles(UserRole.ADMIN, UserRole.INVENTORY, UserRole.FINANCE)
  @Get()
  findAll(@Query('search') search?: string) {
    return this.suppliersService.findAll(search);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.suppliersService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSupplierDto) {
    return this.suppliersService.update(id, dto);
  }

  @Patch(':id/activate')
  activate(@Param('id') id: string) {
    return this.suppliersService.setActive(id, true);
  }

  @Patch(':id/deactivate')
  deactivate(@Param('id') id: string) {
    return this.suppliersService.setActive(id, false);
  }

  @Post(':id/products')
  linkProduct(@Param('id') id: string, @Body() dto: LinkSupplierProductDto) {
    return this.suppliersService.linkProduct(id, dto);
  }

  @Delete(':id/products/:productId')
  unlinkProduct(@Param('id') id: string, @Param('productId') productId: string) {
    return this.suppliersService.unlinkProduct(id, productId);
  }
}
