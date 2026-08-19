import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ProductsService } from './products.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ProductsService', () => {
  let service: ProductsService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;

  beforeEach(() => {
    prisma = {
      product: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn().mockResolvedValue(0) },
      productEquivalence: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
    };
    service = new ProductsService(prisma as unknown as PrismaService);
  });

  describe('findAll', () => {
    /**
     * O PDV mostra "N em estoque" a partir daqui. O número precisa ser o do
     * depósito de onde a venda vai sair: somar todos os depósitos faria o
     * vendedor ver 5 e a venda ser recusada porque as 5 estão em outro lugar.
     */
    it('filtra o saldo pelo depósito informado', async () => {
      prisma.product.findMany.mockResolvedValue([
        { id: 'p1', name: 'Peça', stockItems: [{ warehouseId: 'dep-1', quantity: 3 }] },
      ]);

      const resultado = await service.findAll({ warehouseId: 'dep-1' } as never);

      // O filtro tem de viajar na consulta — não dá para somar tudo e depois
      // escolher, porque o produto pode ter saldo em vários depósitos.
      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            stockItems: expect.objectContaining({ where: { warehouseId: 'dep-1' } }),
          }),
        }),
      );
      expect((resultado.items as { totalQuantity: number }[])[0].totalQuantity).toBe(3);
    });

    it('sem depósito informado, soma todos — é o número da tela de catálogo', async () => {
      prisma.product.findMany.mockResolvedValue([
        {
          id: 'p1',
          name: 'Peça',
          stockItems: [
            { warehouseId: 'dep-1', quantity: 3 },
            { warehouseId: 'dep-2', quantity: 4 },
          ],
        },
      ]);

      const resultado = await service.findAll({} as never);

      expect((resultado.items as { totalQuantity: number }[])[0].totalQuantity).toBe(7);
    });

    it('não devolve stockItems cru junto — só o saldo já somado', async () => {
      prisma.product.findMany.mockResolvedValue([
        { id: 'p1', name: 'Peça', stockItems: [{ warehouseId: 'dep-1', quantity: 3 }] },
      ]);

      const resultado = await service.findAll({ warehouseId: 'dep-1' } as never);

      expect(resultado.items[0]).not.toHaveProperty('stockItems');
    });
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

/**
 * O mínimo é o ponto de REPOSIÇÃO, não o piso do desespero.
 *
 * Esta regra vive em cinco lugares (aqui, no sino de avisos, nas automações,
 * no retrato do negócio e no selo colorido da lista de peças). Quando um deles
 * discorda, o estrago é silencioso e confuso: medido na loja demo, o sino
 * contava 2 peças em falta e esta lista devolvia 1 — a pessoa clicava no aviso
 * e não achava o que ele tinha acabado de contar.
 */
describe('ProductsService.lowStock', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function comEstoque(itens: { minStock: number; quantidades: number[]; name: string }[]): any {
    return {
      product: {
        findMany: jest.fn().mockResolvedValue(
          itens.map((i, indice) => ({
            id: `p${indice}`,
            name: i.name,
            minStock: i.minStock,
            stockItems: i.quantidades.map((quantity) => ({ quantity })),
          })),
        ),
      },
    };
  }

  it('estar NO mínimo já entra na lista', async () => {
    const prisma = comEstoque([{ name: 'Ventoinha', minStock: 3, quantidades: [3] }]);
    const service = new ProductsService(prisma as unknown as PrismaService);

    const lista = await service.lowStock();
    expect(lista.map((p) => p.name)).toEqual(['Ventoinha']);
  });

  it('uma unidade acima do mínimo fica de fora', async () => {
    const prisma = comEstoque([{ name: 'Radiador', minStock: 3, quantidades: [4] }]);
    const service = new ProductsService(prisma as unknown as PrismaService);

    await expect(service.lowStock()).resolves.toEqual([]);
  });

  it('soma os depósitos antes de comparar', async () => {
    // 2 na frente + 2 no fundo = 4, acima do mínimo 3. Olhar depósito por
    // depósito acusaria falta que não existe.
    const prisma = comEstoque([{ name: 'Correia', minStock: 3, quantidades: [2, 2] }]);
    const service = new ProductsService(prisma as unknown as PrismaService);

    await expect(service.lowStock()).resolves.toEqual([]);
  });

  it('só peças ativas são consultadas', async () => {
    const prisma = comEstoque([]);
    const service = new ProductsService(prisma as unknown as PrismaService);

    await service.lowStock();
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true } }),
    );
  });
});

/**
 * O filtro de peça ativa existe porque duas telas usam a MESMA rota e querem
 * coisas opostas: o PDV não pode oferecer no balcão o que a loja tirou de
 * linha, e a lista de Produtos precisa continuar mostrando as inativas — é lá
 * que se reativa uma delas.
 */
describe('ProductsService.findAll — peças desativadas', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function montar(): any {
    return {
      product: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
  }

  it('sem pedir, traz ativas e inativas — é o que a lista de Produtos precisa', async () => {
    const prisma = montar();
    const service = new ProductsService(prisma as unknown as PrismaService);

    await service.findAll({});

    const where = (prisma.product.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.isActive).toBeUndefined();
  });

  it('com onlyActive, filtra — é o que a busca do PDV pede', async () => {
    const prisma = montar();
    const service = new ProductsService(prisma as unknown as PrismaService);

    await service.findAll({ onlyActive: true });

    const where = (prisma.product.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.isActive).toBe(true);
    // A contagem tem que usar o mesmo filtro, senão a paginação promete
    // páginas que não existem.
    expect((prisma.product.count as jest.Mock).mock.calls[0][0].where.isActive).toBe(true);
  });
});
