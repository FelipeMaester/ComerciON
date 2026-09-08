import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { QueryQuotesDto, QuotesAprovadosDesdeDto } from './dto/query-quotes.dto';
import { QuotesService } from './quotes.service';

@ApiTags('quotes')
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.SALES)
@Controller('quotes')
export class QuotesController {
  constructor(private readonly quotesService: QuotesService) {}

  @Post()
  create(@Body() dto: CreateQuoteDto) {
    return this.quotesService.create(dto);
  }

  @Get()
  findAll(@Query() query: QueryQuotesDto) {
    return this.quotesService.findAll(query);
  }

  // ANTES de @Get(:id): declarada depois, a rota literal seria engolida pelo
  // parâmetro e "aprovados-desde" viraria um id de orçamento inexistente.
  @Get('aprovados-desde')
  aprovadosDesde(@Query() query: QuotesAprovadosDesdeDto) {
    return this.quotesService.aprovadosDesde(query.desde);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.quotesService.findOne(id);
  }

  // Aprovação/recusa manual pela equipe — mesmo efeito do link público
  // enviado ao cliente (ver StorefrontController), para os casos em que o
  // cliente responde por telefone/presencialmente em vez de usar o link.
  @Post(':id/approve')
  approve(@Param('id') id: string) {
    return this.quotesService.approveById(id);
  }

  @Post(':id/reject')
  reject(@Param('id') id: string) {
    return this.quotesService.rejectById(id);
  }
}
