import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  tenantId?: string;
  userId?: string;
  action: string;
  entity: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry): Promise<void> {
    // cast pontual: metadata é JSON livre por natureza (payload variável por
    // ação), não vale a pena forçar o tipo recursivo InputJsonValue do Prisma
    // até a fronteira do domínio.
    await this.prisma.auditLog.create({ data: entry as Prisma.AuditLogCreateInput });
  }
}
