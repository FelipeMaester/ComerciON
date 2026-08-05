import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Payload simulado de um webhook de provedor de WhatsApp (formato próprio,
 * simplificado). Um provedor real (Cloud API, Z-API, Evolution API) manda um
 * payload no seu próprio formato — a troca fica isolada aqui, sem afetar o
 * resto do módulo.
 */
export class InboundMessageDto {
  @ApiProperty({ example: '+5511999998888' })
  @IsString()
  @IsNotEmpty()
  from!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  text!: string;
}
