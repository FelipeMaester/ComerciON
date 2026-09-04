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
  // Identidade visual: logo no menu do painel, cor pintando o painel inteiro.
  logoUrl: true,
  logoPosition: true,
  primaryColor: true,
  // Governa menu E cupom: ver common/brand-display.ts.
  brandDisplay: true,
  cardFeeRates: true,
} as const;

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(tenantId: string) {
    return this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: SETTINGS_SELECT });
  }

  /**
   * Só as taxas de cartão, para o PDV.
   *
   * Existe porque `getSettings` é de ADMIN e o balcão precisa do repasse da
   * taxa em toda venda no crédito. Devolver o objeto inteiro com um @Roles
   * mais largo entregaria de brinde os dados da empresa e a marca; devolver
   * nada fazia o PDV assumir taxa zero em silêncio, que é como o defeito
   * aparecia — a loja absorvendo a taxa sempre que quem vendia não era o dono.
   */
  async getTaxasDeCartao(tenantId: string) {
    return this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { cardFeeRates: true },
    });
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
