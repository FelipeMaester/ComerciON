import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ModuleKey, UserRole } from '@prisma/client';
import { RequiresModule } from '../common/decorators/requires-module.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AutomationEngineService } from './automation-engine.service';
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
    private readonly engine: AutomationEngineService,
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
  /**
   * Roda agora as regras agendadas, sem esperar o cron das 10h.
   *
   * Existe porque montar uma automação e só descobrir no dia seguinte se ela
   * funcionou é o tipo de espera que faz o recurso ser abandonado. Com as
   * cobranças por aprovação isso ficou seguro: rodar agora prepara mensagens
   * numa fila, não dispara nada para ninguém.
   *
   * O motor já protege contra repetição: o que uma regra disparou não
   * dispara de novo, então apertar duas vezes não gera cobrança em dobro.
   */
  @Post('run-now')
  async runNow() {
    await this.engine.scanTimeBasedRules();
    return { executado: true };
  }

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
