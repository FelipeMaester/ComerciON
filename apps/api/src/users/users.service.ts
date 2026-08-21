import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
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
