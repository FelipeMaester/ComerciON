import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { AddProductEquivalenceDto } from './dto/add-product-equivalence.dto';
import { QueryProductsDto } from './dto/query-products.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';

@ApiTags('products')
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.INVENTORY, UserRole.SALES)
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.INVENTORY)
  create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  // Um DTO só com TODOS os parâmetros (paginação + filtros): o ValidationPipe
  // roda com forbidNonWhitelisted, então qualquer um que ficasse de fora do
  // DTO viraria 400.
  @Get()
  findAll(@Query() query: QueryProductsDto) {
    return this.productsService.findAll(query);
  }

  @Get('low-stock')
  lowStock(@Query() query: QueryProductsDto) {
    return this.productsService.lowStock(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.INVENTORY)
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(id, dto);
  }

  @Patch(':id/activate')
  @Roles(UserRole.ADMIN, UserRole.INVENTORY)
  activate(@Param('id') id: string) {
    return this.productsService.setActive(id, true);
  }

  @Patch(':id/deactivate')
  @Roles(UserRole.ADMIN, UserRole.INVENTORY)
  deactivate(@Param('id') id: string) {
    return this.productsService.setActive(id, false);
  }

  @Get(':id/equivalents')
  listEquivalents(@Param('id') id: string) {
    return this.productsService.listEquivalents(id);
  }

  @Post(':id/equivalents')
  @Roles(UserRole.ADMIN, UserRole.INVENTORY)
  addEquivalent(@Param('id') id: string, @Body() dto: AddProductEquivalenceDto) {
    return this.productsService.addEquivalent(id, dto.equivalentId);
  }

  @Delete(':id/equivalents/:equivalentId')
  @Roles(UserRole.ADMIN, UserRole.INVENTORY)
  removeEquivalent(@Param('id') id: string, @Param('equivalentId') equivalentId: string) {
    return this.productsService.removeEquivalent(id, equivalentId);
  }
}
