import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { AprovacaoService } from './aprovacao.service';

class AprovarDto {
  /** Texto final, quando a pessoa ajustou a mensagem antes de aprovar. */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  texto?: string;
}

/**
 * Sem @Roles: quem atende é quem conhece o cliente e sabe se aquela cobrança
 * faz sentido hoje. Restringir ao ADMIN empurraria a decisão para quem está
 * longe do balcão, e a fila ficaria parada.
 */
@ApiTags('whatsapp')
@ApiBearerAuth()
@Controller('whatsapp/aprovacoes')
export class AprovacaoController {
  constructor(private readonly aprovacaoService: AprovacaoService) {}

  @ApiOperation({ summary: 'Cobranças escritas pelo sistema, esperando autorização' })
  @Get()
  listar() {
    return this.aprovacaoService.listar();
  }

  @ApiOperation({ summary: 'Autoriza e envia a mensagem (aceita texto editado)' })
  @Post(':id/aprovar')
  aprovar(@Param('id') id: string, @Body() dto: AprovarDto) {
    return this.aprovacaoService.aprovar(id, dto.texto);
  }

  @ApiOperation({ summary: 'Descarta a mensagem sem enviar' })
  @Delete(':id')
  async descartar(@Param('id') id: string) {
    await this.aprovacaoService.descartar(id);
    return { descartada: true };
  }
}
