import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

/**
 * A senha definida pelo administrador é a saída de emergência do login: existe
 * para quando o e-mail de "esqueci minha senha" não chega — provedor sem
 * configurar, endereço errado no cadastro, mensagem no spam.
 *
 * Por ser uma rota que troca a senha de OUTRA pessoa sem pedir a senha atual,
 * cada limite aqui é o que a impede de virar caminho de tomada de conta.
 */
describe('UsersService.definirSenha', () => {
  const ALVO = { id: 'u-alvo', name: 'Rita', email: 'rita@loja.com', role: UserRole.SALES };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  let mail: { sendPasswordChanged: jest.Mock };
  let audit: { log: jest.Mock };

  function criar() {
    const config = { get: jest.fn(() => 4) } as unknown as ConfigService;
    return new UsersService(
      prisma as PrismaService,
      config,
      mail as unknown as MailService,
      audit as unknown as AuditService,
    );
  }

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(ALVO),
        update: jest.fn().mockResolvedValue(ALVO),
      },
      refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      tenant: { findUnique: jest.fn().mockResolvedValue({ name: 'AutoPeças Silva' }) },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    mail = { sendPasswordChanged: jest.fn().mockResolvedValue(undefined) };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
  });

  it('grava a senha como hash e derruba as sessões abertas do alvo', async () => {
    await criar().definirSenha('loja-1', ALVO.id, 'SenhaNova1', 'u-admin');

    // O hash é o ponto: guardar a senha em texto seria pior que não ter a rota.
    const [dadosDaSenha] = prisma.user.update.mock.calls[0];
    expect(dadosDaSenha.data.passwordHash).not.toBe('SenhaNova1');
    expect(await bcrypt.compare('SenhaNova1', dadosDaSenha.data.passwordHash)).toBe(true);

    // Se a conta foi tomada — que é uma das razões de alguém pedir isto —,
    // trocar a senha sem revogar o refresh token deixaria o invasor logado.
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: ALVO.id, revokedAt: null } }),
    );

    // As duas coisas vão na MESMA transação: senha nova com sessão velha viva,
    // nem que seja por um instante, é a janela que a revogação existe para fechar.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('avisa o dono da conta por e-mail e registra quem trocou', async () => {
    await criar().definirSenha('loja-1', ALVO.id, 'SenhaNova1', 'u-admin');

    // O aviso é a defesa contra um administrador assumir a conta de outra
    // pessoa em silêncio.
    expect(mail.sendPasswordChanged).toHaveBeenCalledWith(
      expect.objectContaining({ to: ALVO.email, tenantName: 'AutoPeças Silva' }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PASSWORD_SET_BY_ADMIN', userId: 'u-admin', entityId: ALVO.id }),
    );
  });

  it('define a senha mesmo com o e-mail de aviso falhando', async () => {
    // E-mail fora do ar é justamente o cenário que criou esta rota. Se a falha
    // do aviso derrubasse a troca, a saída de emergência não funcionaria
    // exatamente na emergência.
    mail.sendPasswordChanged.mockRejectedValue(new Error('SMTP recusou'));

    await expect(criar().definirSenha('loja-1', ALVO.id, 'SenhaNova1', 'u-admin')).resolves.toEqual({
      definida: true,
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('recusa trocar a senha do super-administrador', async () => {
    // Ele opera a plataforma, não a loja: seria dar a chave do prédio a quem
    // tem a chave de uma sala.
    prisma.user.findUnique.mockResolvedValue({ ...ALVO, role: UserRole.SUPER_ADMIN });

    await expect(criar().definirSenha('loja-1', ALVO.id, 'SenhaNova1', 'u-admin')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('recusa a própria senha: essa exige a senha atual', async () => {
    // Sem isto, quem pegasse uma sessão de administrador aberta trocaria a
    // senha sem conhecê-la e trancaria o dono para fora da própria loja.
    await expect(criar().definirSenha('loja-1', ALVO.id, 'SenhaNova1', ALVO.id)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
