import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthenticatedCustomer, CustomerJwtPayload } from '../types/customer-jwt-payload.type';

// Strategy nomeada 'customer-jwt' — nunca deve ser confundida com a strategy
// 'jwt' de staff. Segredo (CUSTOMER_JWT_ACCESS_SECRET) é totalmente separado
// do usado para tokens de equipe, então um token de cliente jamais valida aqui.
@Injectable()
export class CustomerJwtStrategy extends PassportStrategy(Strategy, 'customer-jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('CUSTOMER_JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: CustomerJwtPayload): Promise<AuthenticatedCustomer> {
    return payload;
  }
}
