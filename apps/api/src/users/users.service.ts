import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
  ) {}

  // tenantId chega explícito nos métodos (em vez de ler do TenantContextService
  // aqui dentro) para deixar claro, no controller, que toda rota é tenant-scoped.
  async create(tenantId: string, dto: CreateUserDto) {
    if (dto.role === UserRole.SUPER_ADMIN) {
      throw new BadRequestException('SUPER_ADMIN não pode ser atribuído por este endpoint');
    }

    const existing = await this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId, email: dto.email.toLowerCase() } },
    });
    if (existing) {
      throw new ConflictException('Já existe um usuário com este e-mail neste tenant');
    }

    // Number(...) explícito: ConfigService.get<number>() não converte em runtime,
    // env vars chegam como string e bcrypt trataria isso como salt, não cost factor.
    const saltRounds = Number(this.config.get('BCRYPT_SALT_ROUNDS', 12));
    const passwordHash = await bcrypt.hash(dto.password, saltRounds);

    const user = await this.prisma.user.create({
      data: {
        tenantId,
        name: dto.name,
        email: dto.email.toLowerCase(),
        passwordHash,
        role: dto.role,
      },
    });
    return this.toResponse(user);
  }

  async findAll() {
    const users = await this.prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
    return users.map((u) => this.toResponse(u));
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    return this.toResponse(user);
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.assertExists(id);
    const user = await this.prisma.user.update({ where: { id }, data: dto });
    return this.toResponse(user);
  }

  async setActive(id: string, isActive: boolean) {
    await this.assertExists(id);
    const user = await this.prisma.user.update({ where: { id }, data: { isActive } });
    return this.toResponse(user);
  }

  /**
   * O administrador define uma nova senha para alguém da equipe.
   *
   * POR QUE ISTO EXISTE
   * Até aqui, a ÚNICA forma de recuperar uma senha era o link por e-mail. E
   * e-mail falha de mais jeitos do que o sistema enxerga: o provedor pode não
   * estar configurado (com MAIL_PROVIDER=stub a tela diz "enviamos um link"
   * sem mandar nada), o endereço cadastrado pode estar errado ou ter sido
   * desativado pela empresa, e a mensagem pode simplesmente cair no spam de um
   * servidor que ninguém administra. Em qualquer um desses casos a pessoa
   * ficava trancada do lado de fora sem NENHUMA saída pela interface — só
   * mexendo no banco.
   *
   * Existe justamente para não depender do e-mail: é a saída de emergência que
   * qualquer sistema com login precisa ter.
   */
  async definirSenha(tenantId: string, id: string, novaSenha: string, autorId: string) {
    const alvo = await this.assertExists(id);

    // O SUPER_ADMIN opera a plataforma, não a loja. Deixar o administrador de
    // uma loja trocar a senha dele seria dar a chave do prédio a quem tem a
    // chave de uma sala.
    if (alvo.role === UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('A senha do super-administrador não pode ser definida por aqui.');
    }

    // Trocar a PRÓPRIA senha continua exigindo a senha atual (Preferências).
    // Sem esta linha, quem pegasse uma sessão de administrador aberta trocaria
    // a senha sem conhecê-la e trancaria o dono para fora da própria loja.
    if (id === autorId) {
      throw new BadRequestException(
        'Para trocar a sua própria senha, use Preferências: lá o sistema pede a senha atual.',
      );
    }

    const saltRounds = Number(this.config.get('BCRYPT_SALT_ROUNDS', 12));
    const passwordHash = await bcrypt.hash(novaSenha, saltRounds);

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { passwordHash } }),
      // Derruba as sessões abertas do alvo, pelo mesmo motivo da redefinição
      // por e-mail: se a conta foi tomada, trocar a senha sem revogar o refresh
      // token deixaria o invasor logado do mesmo jeito.
      this.prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.audit.log({
      tenantId,
      userId: autorId,
      action: 'PASSWORD_SET_BY_ADMIN',
      entity: 'User',
      entityId: id,
    });

    // O aviso vai para o dono da conta — é a defesa contra um administrador
    // assumir a conta de outra pessoa em silêncio. Best-effort de propósito:
    // e-mail fora do ar é o cenário que criou esta rota, então não pode ser
    // ele a impedir que ela funcione.
    try {
      const empresa = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true },
      });
      await this.mail.sendPasswordChanged({
        to: alvo.email,
        userName: alvo.name,
        tenantName: empresa?.name ?? 'sua empresa',
      });
    } catch (error) {
      this.logger.warn(`Senha definida, mas o aviso por e-mail falhou: ${(error as Error).message}`);
    }

    return { definida: true };
  }

  private async assertExists(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    return user;
  }

  private toResponse(user: {
    passwordHash: string;
    twoFactorSecret: string | null;
    [key: string]: unknown;
  }) {
    const { passwordHash, twoFactorSecret, ...rest } = user;
    return rest;
  }
}
