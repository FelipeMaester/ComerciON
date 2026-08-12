import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

const SETTINGS_SELECT = {
  name: true,
  // Impressos no cabeçalho/rodapé do cupom e da OS.
  document: true,
  phone: true,
  addressLine: true,
  tagline: true,
  description: true,
  logoUrl: true,
  bannerUrl: true,
  logoPosition: true,
  bannerPosition: true,
  primaryColor: true,
  cardFeeRates: true,
} as const;

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(tenantId: string) {
    return this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: SETTINGS_SELECT });
  }

  async updateSettings(tenantId: string, dto: UpdateSettingsDto) {
    // Json? não aceita `null` puro no data do Prisma (precisa de Prisma.JsonNull
    // pra sinalizar "limpar a coluna") — os demais campos são strings/colunas
    // simples e passam direto.
    const { cardFeeRates, ...rest } = dto;
    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        ...rest,
        ...(cardFeeRates !== undefined ? { cardFeeRates: cardFeeRates ?? Prisma.JsonNull } : {}),
      },
      select: SETTINGS_SELECT,
    });
  }
}
