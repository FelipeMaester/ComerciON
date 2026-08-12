import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ModuleKey, UserRole } from '@prisma/client';
import { RequiresModule } from '../common/decorators/requires-module.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AutomationRulesService } from './automation-rules.service';
import { AutomationSuggestionsService } from './automation-suggestions.service';
import { CreateAutomationRuleDto } from './dto/create-rule.dto';
import { UpdateAutomationRuleDto } from './dto/update-rule.dto';

@ApiTags('automation-rules')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@RequiresModule(ModuleKey.AUTOMATIONS)
@Controller('automation-rules')
export class AutomationRulesController {
  constructor(
    private readonly rulesService: AutomationRulesService,
    private readonly suggestionsService: AutomationSuggestionsService,
  ) {}

  @Post()
  create(@Body() dto: CreateAutomationRuleDto) {
    return this.rulesService.create(dto);
  }

  @Get()
  findAll() {
    return this.rulesService.findAll();
  }

  // As rotas literais precisam vir ANTES de @Get(':id') — o Nest casa na
  // ordem de declaração, então 'catalog'/'suggestions' cairiam no parâmetro
  // :id se viessem depois.
  @Get('catalog')
  catalog() {
    return this.rulesService.getCatalog();
  }

  /** Lê o cache de sugestões. Não chama a IA, não custa nada. */
  @Get('suggestions')
  listSuggestions() {
    return this.suggestionsService.list();
  }

  /**
   * Único caminho que chama a IA de verdade — por isso é POST explícito
   * (botão "Analisar meu negócio"), nunca implícito no carregamento da tela.
   */
  @Post('suggestions/refresh')
  refreshSuggestions() {
    return this.suggestionsService.refresh();
  }

  @Post('suggestions/:id/accept')
  acceptSuggestion(@Param('id') id: string) {
    return this.suggestionsService.accept(id);
  }

  @Post('suggestions/:id/dismiss')
  dismissSuggestion(@Param('id') id: string) {
    return this.suggestionsService.dismiss(id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.rulesService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAutomationRuleDto) {
    return this.rulesService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.rulesService.remove(id);
  }

  @Get(':id/runs')
  listRuns(@Param('id') id: string, @Query('limit') limit?: string) {
    return this.rulesService.listRuns(id, limit ? Number(limit) : undefined);
  }
}
