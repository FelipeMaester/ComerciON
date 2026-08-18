import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCategoryDto) {
    if (dto.parentId) {
      await this.assertExists(dto.parentId);
    }
    return this.prisma.category.create({ data: dto as Prisma.CategoryUncheckedCreateInput });
  }

  /**
   * As categorias com quantas peças cada uma tem.
   *
   * A contagem não é enfeite: apagar uma categoria não dá erro — a relação é
   * `onDelete: SetNull`, então as peças simplesmente ficam sem classificação,
   * em silêncio. Com o número na tela, quem vai excluir "Radiadores" sabe
   * antes que quarenta peças vão perder a categoria.
   */
  async findAll() {
    const categorias = await this.prisma.category.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { products: true } } },
    });

    return categorias.map(({ _count, ...categoria }) => ({
      ...categoria,
      productCount: _count.products,
    }));
  }

  async findOne(id: string) {
    return this.assertExists(id);
  }

  async update(id: string, dto: CreateCategoryDto) {
    await this.assertExists(id);
    if (dto.parentId) {
      if (dto.parentId === id) throw new BadRequestException('Categoria não pode ser sua própria categoria pai');
      await this.assertExists(dto.parentId);
    }
    return this.prisma.category.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.assertExists(id);
    await this.prisma.category.delete({ where: { id } });
  }

  private async assertExists(id: string) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Categoria não encontrada');
    return category;
  }
}
