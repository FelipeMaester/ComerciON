import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsHexColor, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { IsCpfCnpj } from '../../common/validators/is-cpf-cnpj.decorator';

// Aceita tanto uma imagem embutida como data URI (o formulário de
// configurações converte o arquivo escolhido via FileReader) quanto uma URL
// http(s) já hospedada em outro lugar — cobre os dois jeitos mais prováveis
// de alguém ter a logo à mão.
const IMAGE_SRC_PATTERN = /^(data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,|https?:\/\/)/i;

// ~2MB de imagem crua vira ~2.7MB em base64 — teto generoso para uma logo
// sem deixar o payload crescer sem limite.
const MAX_IMAGE_LENGTH = 2_800_000;

// object-position CSS gerado ao arrastar a imagem na tela de configurações,
// sempre "NN% NN%" (0-100) — nunca vem de digitação livre do usuário.
const POSITION_PATTERN = /^\d{1,3}% \d{1,3}%$/;

export class UpdateSettingsDto {
  @ApiPropertyOptional({ example: 'Auto Peças Center' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  /**
   * CNPJ (ou CPF) de quem emite a nota.
   *
   * Só podia ser informado no cadastro inicial, onde é opcional — e a mensagem
   * de erro do módulo fiscal manda "cadastrar o CNPJ em Configurações", uma
   * tela que não tinha o campo. Quem se cadastrou sem CNPJ ficava sem nenhuma
   * forma de emitir nota.
   */
  @ApiPropertyOptional({ description: 'CNPJ ou CPF de quem emite a nota fiscal', example: '11222333000181' })
  @IsOptional()
  @IsString()
  @IsCpfCnpj()
  document?: string | null;

  // Os campos abaixo aceitam `null` de propósito — é como o formulário de
  // configurações sinaliza "remover" (ex.: tirar a logo já cadastrada).
  @ApiPropertyOptional({ description: 'Data URI (base64) ou URL http(s) da logo' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_IMAGE_LENGTH)
  @Matches(IMAGE_SRC_PATTERN, { message: 'logoUrl deve ser uma imagem em base64 ou uma URL http(s)' })
  logoUrl?: string | null;

  @ApiPropertyOptional({ example: '50% 50%', description: 'object-position CSS: qual parte da logo fica visível no recorte' })
  @IsOptional()
  @IsString()
  @Matches(POSITION_PATTERN, { message: 'logoPosition deve estar no formato "NN% NN%"' })
  logoPosition?: string | null;

  @ApiPropertyOptional({ example: '#0f172a' })
  @IsOptional()
  @IsHexColor()
  primaryColor?: string | null;

  @ApiPropertyOptional({ example: '(14) 3333-4444', description: 'Telefone impresso no cupom' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string | null;

  @ApiPropertyOptional({
    example: 'Rua das Oficinas, 123 — Centro, Bauru/SP',
    description: 'Endereço em uma linha, impresso no cupom',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine?: string | null;

  @ApiPropertyOptional({
    description:
      'Taxas da maquininha de cartão de crédito por parcelamento (1x-12x), em percentual — usadas para calcular o repasse automático da taxa. Array com exatamente 12 posições (índice 0 = 1x); use 0 para parcelamento sem repasse.',
    example: [2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0, 7.5, 8.0],
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(12)
  @ArrayMaxSize(12)
  @IsNumber({}, { each: true })
  @Min(0, { each: true })
  @Max(100, { each: true })
  cardFeeRates?: number[] | null;
}
