import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { PrismaService } from '../prisma/prisma.service';

describe('CategoriesService', () => {
  let service: CategoriesService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;

  beforeEach(() => {
    prisma = {
      category: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    service = new CategoriesService(prisma as unknown as PrismaService);
  });

  describe('findAll', () => {
    it('devolve quantas peças cada categoria tem', async () => {
      prisma.category.findMany.mockResolvedValue([
        { id: 'c1', name: 'Radiadores', parentId: null, _count: { products: 40 } },
        { id: 'c2', name: 'Ventoinhas', parentId: null, _count: { products: 0 } },
      ]);

      const lista = await service.findAll();

      expect(lista).toEqual([
        { id: 'c1', name: 'Radiadores', parentId: null, productCount: 40 },
        { id: 'c2', name: 'Ventoinhas', parentId: null, productCount: 0 },
      ]);
      // O `_count` do Prisma não vaza para a tela: quem consome não precisa
      // saber como a contagem foi feita.
      expect(lista[0]).not.toHaveProperty('_count');
    });

    it('ordena por nome, para a lista não mudar de ordem a cada carregamento', async () => {
      prisma.category.findMany.mockResolvedValue([]);
      await service.findAll();
      expect(prisma.category.findMany.mock.calls[0][0].orderBy).toEqual({ name: 'asc' });
    });
  });

  describe('update', () => {
    it('recusa a categoria virar pai dela mesma', async () => {
      prisma.category.findUnique.mockResolvedValue({ id: 'c1', name: 'Radiadores' });

      await expect(service.update('c1', { name: 'Radiadores', parentId: 'c1' })).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.category.update).not.toHaveBeenCalled();
    });

    it('renomeia quando a categoria existe', async () => {
      prisma.category.findUnique.mockResolvedValue({ id: 'c1', name: 'Radiadors' });
      prisma.category.update.mockResolvedValue({ id: 'c1', name: 'Radiadores' });

      const resultado = await service.update('c1', { name: 'Radiadores' });

      expect(resultado.name).toBe('Radiadores');
      expect(prisma.category.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { name: 'Radiadores' },
      });
    });

    it('não renomeia categoria inexistente', async () => {
      prisma.category.findUnique.mockResolvedValue(null);
      await expect(service.update('sumida', { name: 'Qualquer' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('apaga a categoria; as peças ficam sem classificação, não somem', async () => {
      // A relação em Product é `onDelete: SetNull`. É o comportamento certo —
      // apagar uma gaveta não joga fora o que estava dentro dela — e é por
      // isso que a tela mostra a contagem antes de deixar excluir.
      prisma.category.findUnique.mockResolvedValue({ id: 'c1', name: 'Radiadores' });

      await service.remove('c1');

      expect(prisma.category.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
    });

    it('não apaga o que não existe', async () => {
      prisma.category.findUnique.mockResolvedValue(null);
      await expect(service.remove('sumida')).rejects.toThrow(NotFoundException);
      expect(prisma.category.delete).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('recusa categoria pai inexistente antes de gravar', async () => {
      prisma.category.findUnique.mockResolvedValue(null);
      await expect(service.create({ name: 'Mangueiras', parentId: 'sumida' })).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.category.create).not.toHaveBeenCalled();
    });
  });
});
