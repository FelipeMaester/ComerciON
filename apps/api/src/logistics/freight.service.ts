import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface FreightEstimate {
  cost: number;
  estimatedDays: number;
  totalWeightKg: number;
}

// Tabela por região — modelo comum de "frete por faixa" usado por pequenos
// comércios antes de integrar a API de uma transportadora/Correios de verdade.
// Sem credenciais reais nesta fase; ver LogisticsProvider (futuro) para trocar
// por um cálculo real via API dos Correios/transportadora.
const REGION_MULTIPLIER: Record<string, number> = {
  SP: 1.0,
  RJ: 1.3,
  MG: 1.3,
  ES: 1.3,
  PR: 1.4,
  SC: 1.4,
  RS: 1.5,
};
const DEFAULT_MULTIPLIER = 1.8;

const BASE_FEE = 15;
const PER_KG_RATE = 3;
const DEFAULT_PRODUCT_WEIGHT_KG = 0.5;

@Injectable()
export class FreightService {
  constructor(private readonly prisma: PrismaService) {}

  calculate(destinationState: string, totalWeightKg: number): FreightEstimate {
    const multiplier = REGION_MULTIPLIER[destinationState.toUpperCase()] ?? DEFAULT_MULTIPLIER;
    const cost = Math.round((BASE_FEE + PER_KG_RATE * totalWeightKg) * multiplier * 100) / 100;
    const estimatedDays = multiplier <= 1.0 ? 2 : multiplier <= 1.4 ? 4 : multiplier <= 1.5 ? 6 : 10;
    return { cost, estimatedDays, totalWeightKg: Math.round(totalWeightKg * 1000) / 1000 };
  }

  async estimateForItems(
    items: { productId: string; quantity: number }[],
    destinationState: string,
  ): Promise<FreightEstimate> {
    const products = await this.prisma.product.findMany({
      where: { id: { in: items.map((i) => i.productId) } },
    });
    const weightMap = new Map(products.map((p) => [p.id, Number(p.weightKg)]));
    const totalWeightKg = items.reduce(
      (sum, item) => sum + (weightMap.get(item.productId) ?? DEFAULT_PRODUCT_WEIGHT_KG) * item.quantity,
      0,
    );
    return this.calculate(destinationState, totalWeightKg);
  }
}
