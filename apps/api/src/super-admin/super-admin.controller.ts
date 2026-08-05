import { Body, Controller, Get, Param, Patch, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { SubscribeDto } from '../billing/dto/subscribe.dto';
import { UpdateTenantStatusDto } from './dto/update-tenant-status.dto';
import { SuperAdminService } from './super-admin.service';

@ApiTags('super-admin')
@ApiBearerAuth()
@Roles(UserRole.SUPER_ADMIN)
@Controller('admin/tenants')
export class SuperAdminController {
  constructor(private readonly superAdminService: SuperAdminService) {}

  @Get()
  list() {
    return this.superAdminService.listTenants();
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.superAdminService.getTenant(id);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateTenantStatusDto) {
    return this.superAdminService.updateStatus(id, dto.status);
  }

  @Put(':id/plan')
  changePlan(@Param('id') id: string, @Body() dto: SubscribeDto) {
    return this.superAdminService.changePlan(id, dto.planKey);
  }
}
