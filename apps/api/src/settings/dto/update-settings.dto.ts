import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsHexColor, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

// Aceita tanto uma imagem embutida como data URI (o formulário de
// configurações converte o arquivo escolhido via FileReader) quanto uma URL
// http(s) já hospedada em outro lugar — cobre os dois jeitos mais prováveis
// de alguém ter uma logo/banner à mão.
const IMAGE_SRC_PATTERN = /^(data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,|https?:\/\/)/i;

// ~2MB de imagem crua vira ~2.7MB em base64 — teto generoso para logo/banner
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

  // Os campos abaixo aceitam `null` de propósito — é como o formulário de
  // configurações sinaliza "remover" (ex.: tirar a logo já cadastrada).
  @ApiPropertyOptional({ example: 'Peças e acessórios com entrega em todo o Brasil' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  tagline?: string | null;

  @ApiPropertyOptional({ example: 'Distribuidora especializada em peças automotivas há mais de 20 anos.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional({ description: 'Data URI (base64) ou URL http(s) da logo' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_IMAGE_LENGTH)
  @Matches(IMAGE_SRC_PATTERN, { message: 'logoUrl deve ser uma imagem em base64 ou uma URL http(s)' })
  logoUrl?: string | null;

  @ApiPropertyOptional({ description: 'Data URI (base64) ou URL http(s) do banner' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_IMAGE_LENGTH)
  @Matches(IMAGE_SRC_PATTERN, { message: 'bannerUrl deve ser uma imagem em base64 ou uma URL http(s)' })
  bannerUrl?: string | null;

  @ApiPropertyOptional({ example: '50% 50%', description: 'object-position CSS: qual parte da logo fica visível no recorte' })
  @IsOptional()
  @IsString()
  @Matches(POSITION_PATTERN, { message: 'logoPosition deve estar no formato "NN% NN%"' })
  logoPosition?: string | null;

  @ApiPropertyOptional({ example: '50% 50%', description: 'object-position CSS: qual parte do banner fica visível no recorte' })
  @IsOptional()
  @IsString()
  @Matches(POSITION_PATTERN, { message: 'bannerPosition deve estar no formato "NN% NN%"' })
  bannerPosition?: string | null;

  @ApiPropertyOptional({ example: '#0f172a' })
  @IsOptional()
  @IsHexColor()
  primaryColor?: string | null;
}
