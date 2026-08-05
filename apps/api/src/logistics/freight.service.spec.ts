import { FreightService } from './freight.service';
import { PrismaService } from '../prisma/prisma.service';

describe('FreightService', () => {
  describe('calculate', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new FreightService({} as unknown as PrismaService);

    it('cobra o menor multiplicador para o estado de origem (SP)', () => {
      const result = service.calculate('SP', 1);
      expect(result.cost).toBe(18); // (15 + 3*1) * 1.0
      expect(result.estimatedDays).toBe(2);
    });

    it('aplica multiplicador maior para estados fora da região Sudeste/Sul', () => {
      const result = service.calculate('BA', 1);
      expect(result.cost).toBe(32.4); // (15 + 3*1) * 1.8
      expect(result.estimatedDays).toBe(10);
    });

    it('é case-insensitive para a UF', () => {
      const upper = service.calculate('RJ', 2);
      const lower = service.calculate('rj', 2);
      expect(upper.cost).toBe(lower.cost);
    });

    it('escala com o peso total', () => {
      const light = service.calculate('SP', 1);
      const heavy = service.calculate('SP', 5);
      expect(heavy.cost).toBeGreaterThan(light.cost);
    });
  });

  describe('estimateForItems', () => {
    it('usa o peso default (0.5kg) quando o produto não tem weightKg definido no mock', async () => {
      const prisma = {
        product: { findMany: jest.fn().mockResolvedValue([{ id: 'p1', weightKg: 2 }]) },
      };
      const service = new FreightService(prisma as unknown as PrismaService);

      const result = await service.estimateForItems(
        [
          { productId: 'p1', quantity: 2 }, // 2kg * 2 = 4kg
          { productId: 'p2', quantity: 1 }, // não encontrado -> 0.5kg default
        ],
        'SP',
      );

      expect(result.totalWeightKg).toBe(4.5);
    });
  });
});
