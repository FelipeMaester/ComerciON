import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TenantStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { AuditService } from '../audit/audit.service';

/**
 * Visão de plataforma para o super-admin: enxerga todos os tenants de uma
 * vez (Tenant/Subscription/Plan não são tenant-scoped, então essas
 * consultas não precisam — e não devem — passar pelo isolamento normal).
 * Nunca expõe dados de negócio de um tenant específico (vendas, clientes
 * etc.) — só o que é da própria plataforma (status, plano, faturas).
 */
@Injectable()
export class SuperAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billingService: BillingService,
    private readonly audit: AuditService,
  ) {}

  async listTenants() {
    return this.prisma.tenant.findMany({
      include: {
        subscription: { include: { plan: true } },
        _count: { select: { users: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getTenant(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        subscription: { include: { plan: true, invoices: { orderBy: { createdAt: 'desc' } } } },
      },
    });
    if (!tenant) throw new NotFoundException('Tenant não encontrado');
    return tenant;
  }

  async updateStatus(id: string, status: TenantStatus) {
    await this.getTenant(id);
    return this.prisma.tenant.update({ where: { id }, data: { status } });
  }

  /**
   * Exclui a loja e tudo que pertence a ela. Não tem volta.
   *
   * Existe porque a loja que encerra o contrato tem direito de pedir os dados
   * fora — e até aqui o sistema não tinha como atender. A tentativa falhava com
   * violação de chave estrangeira: cinco tabelas apontam para User, Customer e
   * Vehicle sem `onDelete`, o que no Prisma significa RESTRICT.
   *
   * Esse RESTRICT está certo onde está. É ele que impede apagar um operador e
   * levar junto a movimentação de caixa que ele lançou, ou apagar um cliente e
   * sumir com o histórico de orçamentos dele. O que faltava era o caminho de
   * cima, que apaga a LOJA inteira e por isso pode remover na ordem.
   *
   * Pede o identificador da loja de novo, e não só o id: id vem de lista, de
   * link, de copiar e colar; digitar "autopecas-silva" é uma decisão. É a
   * mesma proteção que o GitHub usa para apagar repositório, e pelo mesmo
   * motivo — a operação não tem desfazer.
   */
  async excluirLoja(id: string, slugDeConfirmacao: string) {
    const loja = await this.getTenant(id);

    if (slugDeConfirmacao !== loja.slug) {
      throw new BadRequestException(
        `Para excluir, repita o identificador da loja exatamente como ele é: "${loja.slug}".`,
      );
    }

    // Registrado ANTES de apagar: depois não existe mais de onde tirar nome e
    // identificador. O log sobrevive à loja — a relação dele com Tenant é
    // SetNull de propósito, para o registro de exclusão não se apagar junto
    // com aquilo que ele documenta.
    await this.audit.log({
      action: 'tenant.deleted',
      entity: 'Tenant',
      entityId: id,
      metadata: { slug: loja.slug, nome: loja.name, criadaEm: loja.createdAt },
    });

    // `runAsSystem` NÃO é opcional aqui, e a razão é grave. As tabelas abaixo
    // são filtradas por loja automaticamente, e o filtro SOBRESCREVE o tenantId
    // que a consulta passa — não o complementa. Sem isto, o super admin que
    // manda apagar a loja A apaga os dados da PRÓPRIA loja dele.
    //
    // Não é hipótese: aconteceu ao testar esta função contra o banco de
    // verdade. A primeira versão levou junto os orçamentos, as ordens de
    // serviço, as tarefas e o caixa da loja de demonstração, porque foi de lá
    // que o comando partiu. Os testes de unidade passavam, porque mock não tem
    // middleware.
    await this.prisma.runAsSystem(() =>
      this.prisma.$transaction(async (tx) => {
        await this.removerOQueBloqueia(tx, id);
        await tx.tenant.delete({ where: { id } });
      }),
    );

    return { excluida: true, slug: loja.slug };
  }

  /**
   * Remove, na ordem, o que impede a loja de sair.
   *
   * Tudo o mais desce por cascade a partir de Tenant. Estas cinco não descem
   * porque apontam para User, Customer e Vehicle com RESTRICT, e precisam sair
   * antes — movimentação antes da sessão de caixa que a contém, ordem de
   * serviço antes do orçamento que a originou.
   *
   * Sempre chamado de dentro de `runAsSystem`. O `where` daqui traz o tenantId
   * da loja alvo, mas o filtro automático sobrescreveria com o da loja de quem
   * está executando — ver o comentário em `excluirLoja`.
   */
  private async removerOQueBloqueia(tx: Prisma.TransactionClient, tenantId: string) {
    const where = { tenantId };
    await tx.cashMovement.deleteMany({ where });
    await tx.cashSession.deleteMany({ where });
    await tx.task.deleteMany({ where });
    await tx.serviceOrder.deleteMany({ where });
    await tx.quote.deleteMany({ where });
  }

  /** Override manual do plano (ex.: pagamento confirmado por outro canal). */
  async changePlan(id: string, planKey: string) {
    await this.getTenant(id);
    return this.billingService.subscribe(id, planKey);
  }
}
