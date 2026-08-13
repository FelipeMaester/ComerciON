import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ACCESS_COOKIE, lerCookie } from '../auth-cookies';
import { AuthenticatedUser, JwtPayload } from '../types/jwt-payload.type';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      // O header vem PRIMEIRO de propósito. Mandar Authorization é um ato
      // deliberado de quem chama (script, integração, suíte de testes); o
      // cookie é ambiente, vai junto sem ninguém pedir. Na ordem inversa, um
      // cookie velho no navegador anularia um token bom passado à mão, e o
      // erro resultante — 401 com credencial válida em mãos — é dos que
      // custam uma tarde para entender.
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (req: Request) => lerCookie(req, ACCESS_COOKIE) ?? null,
      ]),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  // O retorno vira `request.user` em toda rota protegida.
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    return payload;
  }
}
