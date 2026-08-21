import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }
    const { user } = context.switchToHttp().getRequest();
    if (requiredRoles.includes(user?.role)) return true;

    // Mensagem própria, e em português: sem isto o Nest responde o padrão dele,
    // "Forbidden resource", que chegava à tela exatamente assim. O super admin
    // da plataforma via essa frase em inglês no meio do painel ao entrar.
    //
    // Diz o papel de quem tentou porque, num sistema com seis papéis, "sem
    // permissão" sozinho não ajuda ninguém a entender o que fazer a seguir.
    throw new ForbiddenException(
      user?.role === UserRole.SUPER_ADMIN
        ? 'Esta tela é da loja, e o super admin da plataforma não acessa dados de loja nenhuma.'
        : 'Seu perfil não tem permissão para esta ação. Fale com o administrador da loja.',
    );
  }
}
