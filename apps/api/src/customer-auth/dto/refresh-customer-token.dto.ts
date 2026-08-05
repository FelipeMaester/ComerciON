import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class RefreshCustomerTokenDto {
  @ApiProperty()
  @IsString()
  refreshToken!: string;
}
