import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { FinancialEntryStatus, FinancialEntryType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFinancialEntryDto } from './dto/create-financial-entry.dto';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateFinancialEntryDto) {
    if (dto.type === FinancialEntryType.PAYABLE && dto.customerId) {
      throw new BadRequestException('Conta a pagar não deve ter customerId — use supplierId');
    }
    if (dto.type === FinancialEntryType.RECEIVABLE && dto.supplierId) {
      throw new BadRequestException('Conta a receber não deve ter supplierId — use customerId');
    }

    return this.prisma.financialEntry.create({
      data: { ...dto, dueDate: new Date(dto.dueDate) } as Prisma.FinancialEntryUncheckedCreateInput,
    });
  }

  async findAll(type?: FinancialEntryType, status?: FinancialEntryStatus, from?: Date, to?: Date) {
    const entries = await this.prisma.financialEntry.findMany({
      where: {
        ...(type ? { type } : {}),
        ...(status ? { status } : {}),
        ...(from || to
          ? { dueDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
          : {}),
      },
      include: { customer: true, supplier: true, sale: true },
      orderBy: { dueDate: 'asc' },
    });

    const now = new Date();
    return entries.map((entry) => ({
      ...entry,
      isOverdue: entry.status === FinancialEntryStatus.PENDING && entry.dueDate < now,
    }));
  }

  async findOne(id: string) {
    const entry = await this.prisma.financialEntry.findUnique({
      where: { id },
      include: { customer: true, supplier: true, sale: true },
    });
    if (!entry) throw new NotFoundException('Lançamento não encontrado');
    return entry;
  }

  async markPaid(id: string) {
    const entry = await this.assertExists(id);
    if (entry.status === FinancialEntryStatus.PAID) throw new BadRequestException('Este lançamento já está pago');
    if (entry.status === FinancialEntryStatus.CANCELED) {
      throw new BadRequestException('Lançamento cancelado não pode ser marcado como pago');
    }
    return this.prisma.financialEntry.update({ where: { id }, data: { status: 'PAID', paidAt: new Date() } });
  }

  async cancel(id: string) {
    const entry = await this.assertExists(id);
    if (entry.status === FinancialEntryStatus.PAID) {
      throw new BadRequestException('Lançamento já pago não pode ser cancelado');
    }
    return this.prisma.financialEntry.update({ where: { id }, data: { status: 'CANCELED' } });
  }

  async cashFlow(from: Date, to: Date) {
    const entries = await this.prisma.financialEntry.findMany({
      where: {
        status: { not: FinancialEntryStatus.CANCELED },
        OR: [{ dueDate: { gte: from, lte: to } }, { paidAt: { gte: from, lte: to } }],
      },
    });

    const previsto = { receitas: 0, despesas: 0 };
    const realizado = { receitas: 0, despesas: 0 };

    for (const entry of entries) {
      const amount = Number(entry.amount);
      const isReceivable = entry.type === FinancialEntryType.RECEIVABLE;

      if (entry.dueDate >= from && entry.dueDate <= to) {
        if (isReceivable) previsto.receitas += amount;
        else previsto.despesas += amount;
      }
      if (entry.paidAt && entry.paidAt >= from && entry.paidAt <= to) {
        if (isReceivable) realizado.receitas += amount;
        else realizado.despesas += amount;
      }
    }

    return {
      from,
      to,
      previsto: {
        receitas: round2(previsto.receitas),
        despesas: round2(previsto.despesas),
        saldo: round2(previsto.receitas - previsto.despesas),
      },
      realizado: {
        receitas: round2(realizado.receitas),
        despesas: round2(realizado.despesas),
        saldo: round2(realizado.receitas - realizado.despesas),
      },
    };
  }

  private async assertExists(id: string) {
    const entry = await this.prisma.financialEntry.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException('Lançamento não encontrado');
    return entry;
  }
}
