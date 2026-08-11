import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateQuoteDto } from './dto/create-quote.dto';
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
  findAll() {
    return this.quotesService.findAll();
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
