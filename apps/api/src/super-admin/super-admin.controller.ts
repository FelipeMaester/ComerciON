import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { SubscribeDto } from '../billing/dto/subscribe.dto';
import { ExcluirLojaDto } from './dto/excluir-loja.dto';
import { UpdateTenantStatusDto } from './dto/update-tenant-status.dto';
import { SuperAdminService } from './super-admin.service';

@ApiTags('super-admin')
@ApiBearerAuth()
@Roles(UserRole.SUPER_ADMIN)
@Controller('admin/tenants')
export class SuperAdminController {
  constructor(private readonly superAdminService: SuperAdminService) {}

  @Get()
  list(@Query('search') search?: string) {
    return this.superAdminService.listTenants(search);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.superAdminService.getTenant(id);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateTenantStatusDto) {
    return this.superAdminService.updateStatus(id, dto.status);
  }

  /**
   * Exclui a loja e todos os dados dela. Não tem volta.
   *
   * DELETE com corpo é incomum, e é de propósito: o identificador repetido
   * viaja no corpo, não na URL, para que ninguém apague uma loja por acidente
   * montando um endereço à mão ou repetindo um comando do histórico.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  excluir(@Param('id') id: string, @Body() dto: ExcluirLojaDto) {
    return this.superAdminService.excluirLoja(id, dto.slug);
  }

  @Put(':id/plan')
  changePlan(@Param('id') id: string, @Body() dto: SubscribeDto) {
    return this.superAdminService.changePlan(id, dto.planKey);
  }
}
