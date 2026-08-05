import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsUUID, Min } from 'class-validator';

// Propositalmente SEM unitPrice/discount (diferente de SaleItemDto do PDV):
// preço e desconto do checkout público vêm sempre do catálogo + cupom
// validados no servidor, nunca do cliente. Aceitar um preço vindo do
// request aqui permitiria comprar por qualquer valor.
export class CheckoutItemDto {
  @ApiProperty()
  @IsUUID()
  productId!: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  quantity!: number;
}
