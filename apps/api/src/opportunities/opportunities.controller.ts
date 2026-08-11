import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateOpportunityDto } from './dto/create-opportunity.dto';
import { MarkLostDto } from './dto/mark-lost.dto';
import { MoveStageDto } from './dto/move-stage.dto';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto';
import { OpportunitiesService } from './opportunities.service';

@ApiTags('opportunities')
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.SALES)
@Controller('opportunities')
export class OpportunitiesController {
  constructor(private readonly opportunitiesService: OpportunitiesService) {}

  @Post()
  create(@Body() dto: CreateOpportunityDto) {
    return this.opportunitiesService.create(dto);
  }

  @Get()
  findAll() {
    return this.opportunitiesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.opportunitiesService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateOpportunityDto) {
    return this.opportunitiesService.update(id, dto);
  }

  @Patch(':id/stage')
  moveStage(@Param('id') id: string, @Body() dto: MoveStageDto) {
    return this.opportunitiesService.moveStage(id, dto);
  }

  @Post(':id/lost')
  markLost(@Param('id') id: string, @Body() dto: MarkLostDto) {
    return this.opportunitiesService.markLost(id, dto.reason);
  }
}

// Rota separada (fora de /opportunities) porque etapas do funil são um
// recurso próprio, consultado antes de ter qualquer oportunidade criada
// (ex.: para montar as colunas vazias do Kanban).
@ApiTags('pipeline-stages')
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.SALES)
@Controller('pipeline-stages')
export class PipelineStagesController {
  constructor(private readonly opportunitiesService: OpportunitiesService) {}

  @Get()
  findAll() {
    return this.opportunitiesService.findStages();
  }
}
