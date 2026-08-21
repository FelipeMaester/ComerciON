import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { RolesGuard } from './roles.guard';

/** Contexto de execução mínimo, com o usuário que o guard vai avaliar. */
function contexto(role?: UserRole) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user: role ? { role } : undefined }) }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as never;
}

function guardCom(papeisExigidos: UserRole[] | undefined) {
  const reflector = { getAllAndOverride: () => papeisExigidos } as unknown as Reflector;
  return new RolesGuard(reflector);
}

describe('RolesGuard', () => {
  it('deixa passar quando a rota não exige papel nenhum', () => {
    expect(guardCom(undefined).canActivate(contexto(UserRole.SALES))).toBe(true);
    expect(guardCom([]).canActivate(contexto(UserRole.SALES))).toBe(true);
  });

  it('deixa passar quem tem um dos papéis exigidos', () => {
    const guard = guardCom([UserRole.ADMIN, UserRole.FINANCE]);
    expect(guard.canActivate(contexto(UserRole.FINANCE))).toBe(true);
  });

  /**
   * O motivo desta suíte existir.
   *
   * Recusar devolvia o padrão do Nest — "Forbidden resource" —, e essa frase
   * chegava à tela exatamente assim, em inglês. O super admin da plataforma
   * lia isso no meio do painel ao entrar, porque o painel é a tela de destino
   * do login e ele não tem acesso a dado de loja.
   */
  it('recusa em português, e não com o texto padrão do Nest', () => {
    const guard = guardCom([UserRole.ADMIN]);

    expect(() => guard.canActivate(contexto(UserRole.SALES))).toThrow(ForbiddenException);
    try {
      guard.canActivate(contexto(UserRole.SALES));
    } catch (erro) {
      const mensagem = (erro as ForbiddenException).message;
      expect(mensagem).not.toContain('Forbidden');
      expect(mensagem).toContain('permissão');
    }
  });

  /**
   * Ele não é barrado por engano: quatorze controladores o excluem de
   * propósito, porque quem cuida da plataforma não precisa ver a venda de
   * ninguém. A mensagem diz isso, em vez de sugerir que falta uma permissão.
   */
  it('explica ao super admin que a fronteira é proposital', () => {
    const guard = guardCom([UserRole.ADMIN]);

    try {
      guard.canActivate(contexto(UserRole.SUPER_ADMIN));
      throw new Error('devia ter recusado');
    } catch (erro) {
      expect((erro as ForbiddenException).message).toContain('super admin');
    }
  });

  it('recusa quem chega sem papel nenhum', () => {
    expect(() => guardCom([UserRole.ADMIN]).canActivate(contexto(undefined))).toThrow(ForbiddenException);
  });
});
