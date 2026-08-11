import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ModuleKey, UserRole } from '@prisma/client';
import { RequiresModule } from '../common/decorators/requires-module.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AutomationRulesService } from './automation-rules.service';
import { CreateAutomationRuleDto } from './dto/create-rule.dto';
import { UpdateAutomationRuleDto } from './dto/update-rule.dto';

@ApiTags('automation-rules')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@RequiresModule(ModuleKey.AUTOMATIONS)
@Controller('automation-rules')
export class AutomationRulesController {
  constructor(private readonly rulesService: AutomationRulesService) {}

  @Post()
  create(@Body() dto: CreateAutomationRuleDto) {
    return this.rulesService.create(dto);
  }

  @Get()
  findAll() {
    return this.rulesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.rulesService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAutomationRuleDto) {
    return this.rulesService.update(id, dto);
  }

  @Get(':id/runs')
  listRuns(@Param('id') id: string, @Query('limit') limit?: string) {
    return this.rulesService.listRuns(id, limit ? Number(limit) : undefined);
  }
}
