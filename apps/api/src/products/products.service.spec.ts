import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ProductsService } from './products.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ProductsService', () => {
  let service: ProductsService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;

  beforeEach(() => {
    prisma = {
      product: { findUnique: jest.fn() },
      productEquivalence: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
    };
    service = new ProductsService(prisma as unknown as PrismaService);
  });

  describe('addEquivalent', () => {
    it('rejeita um produto equivalente a si mesmo', async () => {
      await expect(service.addEquivalent('product-1', 'product-1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejeita quando o produto não existe', async () => {
      prisma.product.findUnique.mockResolvedValue(null);
      await expect(service.addEquivalent('product-1', 'product-2')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejeita quando o par já está marcado como equivalente (em qualquer sentido)', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: 'product-1' });
      prisma.productEquivalence.findFirst.mockResolvedValue({ id: 'link-1' });

      await expect(service.addEquivalent('product-1', 'product-2')).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.productEquivalence.create).not.toHaveBeenCalled();
    });

    it('cria o vínculo e retorna a lista atualizada de equivalentes', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: 'product-1' });
      prisma.productEquivalence.findFirst.mockResolvedValue(null);
      prisma.productEquivalence.create.mockResolvedValue({ id: 'link-1' });
      prisma.productEquivalence.findMany.mockResolvedValue([
        { productId: 'product-1', equivalentId: 'product-2', equivalent: { id: 'product-2', name: 'Peça B' }, product: { id: 'product-1' } },
      ]);

      const result = await service.addEquivalent('product-1', 'product-2');

      expect(prisma.productEquivalence.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { productId: 'product-1', equivalentId: 'product-2' } }),
      );
      expect(result).toEqual([{ id: 'product-2', name: 'Peça B' }]);
    });
  });

  describe('listEquivalents', () => {
    it('resolve o produto do "outro lado" do vínculo independentemente da direção salva', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: 'product-2' });
      prisma.productEquivalence.findMany.mockResolvedValue([
        // vínculo foi salvo como product-1 -> product-2; consultando pelo product-2 deve retornar o product-1
        { productId: 'product-1', equivalentId: 'product-2', product: { id: 'product-1', name: 'Peça A' }, equivalent: { id: 'product-2', name: 'Peça B' } },
      ]);

      const result = await service.listEquivalents('product-2');

      expect(result).toEqual([{ id: 'product-1', name: 'Peça A' }]);
    });
  });

  describe('removeEquivalent', () => {
    it('rejeita quando o vínculo não existe', async () => {
      prisma.productEquivalence.findFirst.mockResolvedValue(null);
      await expect(service.removeEquivalent('product-1', 'product-2')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('remove o vínculo encontrado em qualquer sentido', async () => {
      prisma.productEquivalence.findFirst.mockResolvedValue({ id: 'link-1' });
      prisma.productEquivalence.delete.mockResolvedValue({});

      await service.removeEquivalent('product-1', 'product-2');

      expect(prisma.productEquivalence.delete).toHaveBeenCalledWith({ where: { id: 'link-1' } });
    });
  });
});
