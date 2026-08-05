import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Aplicado LOCALMENTE (nunca globalmente) nas rotas do storefront que exigem
 * cliente autenticado. As rotas de staff usam JwtAuthGuard (global); estas
 * rotas precisam de @Public() + este guard para não confundir os dois mundos.
 */
@Injectable()
export class CustomerJwtAuthGuard extends AuthGuard('customer-jwt') {}
