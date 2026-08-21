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
/**
 * Quantas lojas a tela recebe de uma vez.
 *
 * Cinquenta cabem numa tela sem rolagem infinita e sem travar o navegador. Quem
 * precisa de uma loja específica usa a busca; quem precisa de todas usa o banco.
 */
const TETO_DA_LISTA = 50;

/**
 * O que sai antes da loja, nesta ordem.
 *
 * Tudo o mais desce por cascade a partir de Tenant. Estas cinco não descem
 * porque apontam para User, Customer e Vehicle com RESTRICT — e a ordem entre
 * elas importa: movimentação antes da sessão de caixa que a contém, ordem de
 * serviço antes do orçamento que a originou.
 *
 * Tem nome próprio para um teste poder conferi-la contra o schema. Uma tabela
 * nova com a mesma restrição, esquecida aqui, só quebraria a exclusão em
 * produção — no dia em que uma loja pedisse para sair. O teste em
 * `exclusao-de-loja.spec.ts` reprova antes disso, com o nome da tabela.
 */
export const ORDEM_DE_EXCLUSAO = ['CashMovement', 'CashSession', 'Task', 'ServiceOrder', 'Quote'] as const;

@Injectable()
export class SuperAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billingService: BillingService,
    private readonly audit: AuditService,
  ) {}

  /**
   * As lojas da plataforma, filtradas e limitadas.
   *
   * Devolvia todas, sem teto. Com duas mil lojas no banco de desenvolvimento a
   * tela montou duas mil linhas de uma vez — e é desta tela que se exclui uma
   * loja. Procurar a certa rolando dois mil nomes é como o clique erra de
   * linha; a busca é tanto conforto quanto segurança.
   *
   * O total vem junto do recorte para a tela poder dizer "50 de 2.034" em vez
   * de deixar a pessoa achar que são só 50.
   */
  async listTenants(busca?: string) {
    const where: Prisma.TenantWhereInput = busca
      ? {
          OR: [
            { name: { contains: busca, mode: 'insensitive' } },
            { slug: { contains: busca, mode: 'insensitive' } },
          ],
        }
      : {};

    const [items, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where,
        include: {
          subscription: { include: { plan: true } },
          _count: { select: { users: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: TETO_DA_LISTA,
      }),
      this.prisma.tenant.count({ where }),
    ]);

    return { items, total, teto: TETO_DA_LISTA };
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
    const comoApagar: Record<(typeof ORDEM_DE_EXCLUSAO)[number], () => Promise<unknown>> = {
      CashMovement: () => tx.cashMovement.deleteMany({ where }),
      CashSession: () => tx.cashSession.deleteMany({ where }),
      Task: () => tx.task.deleteMany({ where }),
      ServiceOrder: () => tx.serviceOrder.deleteMany({ where }),
      Quote: () => tx.quote.deleteMany({ where }),
    };

    for (const modelo of ORDEM_DE_EXCLUSAO) {
      // eslint-disable-next-line no-await-in-loop
      await comoApagar[modelo]();
    }
  }

  /** Override manual do plano (ex.: pagamento confirmado por outro canal). */
  async changePlan(id: string, planKey: string) {
    await this.getTenant(id);
    return this.billingService.subscribe(id, planKey);
  }
}
