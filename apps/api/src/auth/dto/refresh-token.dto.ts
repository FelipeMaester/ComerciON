import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class RefreshTokenDto {
  /**
   * Opcional porque o navegador manda o refresh token no cookie httpOnly —
   * justamente para que o JavaScript da página não consiga lê-lo e, portanto,
   * não consiga colocá-lo aqui. Continua aceito no corpo para quem chama a API
   * fora do navegador (scripts, integrações, testes).
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
