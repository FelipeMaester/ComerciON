import { Injectable } from '@nestjs/common';
import {
  CashSessionStatus,
  FinancialEntryStatus,
  FinancialEntryType,
  ModuleKey,
  ServiceOrderStatus,
  TaskStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantModulesService } from '../common/modules/tenant-modules.service';

/**
 * Gravidade do aviso. Só três, porque a quarta ninguém distingue no susto.
 *
 * `urgente` é o que JÁ custou dinheiro ou credibilidade (conta vencida, OS
 * atrasada). `atencao` é o que custa se ninguém agir hoje. `informativo` é o
 * que vale saber sem parar o que está fazendo.
 */
export type SeveridadeDoAviso = 'urgente' | 'atencao' | 'informativo';

export interface Aviso {
  /** Identidade estável do aviso, para a tela poder tratar cada um sempre igual. */
  chave: string;
  severidade: SeveridadeDoAviso;
  titulo: string;
  /** O que fazer a respeito, em uma linha. */
  detalhe: string;
  quantidade: number;
  /** Tela que resolve o aviso, já filtrada no que interessa. */
  rota: string;
}

/**
 * O que a loja precisa olhar hoje.
 *
 * O sistema inteiro era passivo: os números existiam, mas só apareciam para
 * quem soubesse abrir a tela certa e reparar. Peça abaixo do mínimo só era
 * descoberta na hora de vender e não ter; conta vencida, quando o fornecedor
 * ligava.
 *
 * Duas regras que este serviço segue:
 *
 * 1. **Aviso sem saída não é aviso.** Todo item leva à rota que resolve, já
 *    filtrada — "12 peças abaixo do mínimo" abre a lista dessas 12, e não a
 *    lista inteira de produtos para a pessoa procurar quais são.
 * 2. **Só avisa o que a loja pode resolver.** Os avisos respeitam os módulos
 *    do plano: sem o módulo Financeiro, conta vencida não aparece — o
 *    contrário seria oferecer um clique que termina em 403.
 */
@Injectable()
export class AlertsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantModules: TenantModulesService,
  ) {}

  async listar(tenantId: string): Promise<{ avisos: Aviso[] }> {
    const { modules } = await this.tenantModules.getForTenant(tenantId);
    const tem = (m: ModuleKey) => modules.includes(m);

    const agora = new Date();
    const inicioDeHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
    const inicioDeAmanha = new Date(inicioDeHoje.getTime() + 24 * 60 * 60 * 1000);

    const [estoque, receber, pagar, ordens, tarefas, caixa] = await Promise.all([
      tem(ModuleKey.INVENTORY) ? this.pecasAbaixoDoMinimo() : 0,
      tem(ModuleKey.FINANCE) ? this.contasVencidas(FinancialEntryType.RECEIVABLE, inicioDeHoje) : 0,
      tem(ModuleKey.FINANCE) ? this.contasVencidas(FinancialEntryType.PAYABLE, inicioDeHoje) : 0,
      tem(ModuleKey.SALES) ? this.ordensAtrasadas(inicioDeHoje) : 0,
      tem(ModuleKey.CRM) ? this.tarefas(inicioDeHoje, inicioDeAmanha) : { atrasadas: 0, hoje: 0 },
      tem(ModuleKey.SALES) ? this.caixaEsquecidoAberto(inicioDeHoje) : 0,
    ]);

    const avisos: Aviso[] = [];

    // Ordem de leitura = ordem de urgência. Quem abre o sino no meio do
    // atendimento lê a primeira linha e mais nada.
    if (pagar > 0) {
      avisos.push({
        chave: 'contas-a-pagar-vencidas',
        severidade: 'urgente',
        titulo: `${pagar} ${pagar === 1 ? 'conta vencida' : 'contas vencidas'} a pagar`,
        detalhe: 'Passou do vencimento e ainda não foi baixada.',
        quantidade: pagar,
        rota: '/finance?tipo=PAYABLE&situacao=vencidas',
      });
    }

    if (receber > 0) {
      avisos.push({
        chave: 'contas-a-receber-vencidas',
        severidade: 'urgente',
        titulo: `${receber} ${receber === 1 ? 'conta vencida' : 'contas vencidas'} a receber`,
        detalhe: 'O cliente passou do prazo — vale uma cobrança.',
        quantidade: receber,
        rota: '/finance?tipo=RECEIVABLE&situacao=vencidas',
      });
    }

    if (ordens > 0) {
      avisos.push({
        chave: 'ordens-atrasadas',
        severidade: 'urgente',
        titulo: `${ordens} ${ordens === 1 ? 'ordem de serviço atrasada' : 'ordens de serviço atrasadas'}`,
        detalhe: 'Passou do dia agendado e ainda não foi concluída.',
        quantidade: ordens,
        rota: '/service-orders?situacao=atrasadas',
      });
    }

    if (tarefas.atrasadas > 0) {
      avisos.push({
        chave: 'tarefas-atrasadas',
        severidade: 'urgente',
        titulo: `${tarefas.atrasadas} ${tarefas.atrasadas === 1 ? 'tarefa atrasada' : 'tarefas atrasadas'}`,
        detalhe: 'O prazo já passou.',
        quantidade: tarefas.atrasadas,
        rota: '/tasks?situacao=atrasadas',
      });
    }

    if (estoque > 0) {
      avisos.push({
        chave: 'estoque-baixo',
        severidade: 'atencao',
        titulo: `${estoque} ${estoque === 1 ? 'peça abaixo do mínimo' : 'peças abaixo do mínimo'}`,
        detalhe: 'Repor antes de perder a venda no balcão.',
        quantidade: estoque,
        rota: '/products?estoque=baixo',
      });
    }

    if (caixa > 0) {
      avisos.push({
        chave: 'caixa-aberto-de-ontem',
        severidade: 'atencao',
        titulo: 'Caixa aberto desde ontem',
        detalhe: 'Fechar o caixa do dia anterior antes de abrir o de hoje.',
        quantidade: caixa,
        rota: '/cash',
      });
    }

    if (tarefas.hoje > 0) {
      avisos.push({
        chave: 'tarefas-de-hoje',
        severidade: 'informativo',
        titulo: `${tarefas.hoje} ${tarefas.hoje === 1 ? 'tarefa para hoje' : 'tarefas para hoje'}`,
        detalhe: 'Ainda dá tempo.',
        quantidade: tarefas.hoje,
        rota: '/tasks?situacao=hoje',
      });
    }

    return { avisos };
  }

  /**
   * `minStock = 0` significa "não controlo mínimo para esta peça" — incluí-la
   * encheria o sino de ruído no dia em que a loja zerasse qualquer item que
   * ela nem repõe. Mesma regra que o motor de automações já usa.
   *
   * A soma é feita em memória porque o estoque de uma peça está espalhado
   * pelos depósitos, e comparar essa soma com uma coluna do próprio registro
   * não cabe num `where` do Prisma.
   */
  private async pecasAbaixoDoMinimo(): Promise<number> {
    const produtos = await this.prisma.product.findMany({
      where: { isActive: true, minStock: { gt: 0 } },
      select: { minStock: true, stockItems: { select: { quantity: true } } },
    });
    return produtos.filter((p) => p.stockItems.reduce((soma, s) => soma + s.quantity, 0) <= p.minStock).length;
  }

  /**
   * Vencida é a que passou do dia e não foi paga nem cancelada.
   *
   * Olha o `dueDate` em vez de confiar só no status OVERDUE: esse status
   * depende de alguém ter rodado a rotina que o atualiza, e o aviso não pode
   * ficar refém disso.
   */
  private contasVencidas(tipo: FinancialEntryType, inicioDeHoje: Date): Promise<number> {
    return this.prisma.financialEntry.count({
      where: {
        type: tipo,
        status: { in: [FinancialEntryStatus.PENDING, FinancialEntryStatus.OVERDUE] },
        dueDate: { lt: inicioDeHoje },
      },
    });
  }

  /** Agendada para antes de hoje e ainda não concluída nem cancelada. */
  private ordensAtrasadas(inicioDeHoje: Date): Promise<number> {
    return this.prisma.serviceOrder.count({
      where: {
        status: { in: [ServiceOrderStatus.OPEN, ServiceOrderStatus.IN_PROGRESS] },
        scheduledAt: { lt: inicioDeHoje },
      },
    });
  }

  private async tarefas(inicioDeHoje: Date, inicioDeAmanha: Date): Promise<{ atrasadas: number; hoje: number }> {
    const [atrasadas, hoje] = await Promise.all([
      this.prisma.task.count({ where: { status: TaskStatus.PENDING, dueDate: { lt: inicioDeHoje } } }),
      this.prisma.task.count({
        where: { status: TaskStatus.PENDING, dueDate: { gte: inicioDeHoje, lt: inicioDeAmanha } },
      }),
    ]);
    return { atrasadas, hoje };
  }

  /**
   * Caixa que ficou aberto de um dia para o outro.
   *
   * Não é frescura de organização: a conferência do fim do dia compara o
   * dinheiro da gaveta com o que o sistema esperava, e uma sessão que atravessa
   * dois dias mistura o movimento dos dois — a diferença aparece e ninguém
   * mais sabe de qual dia ela é.
   */
  private caixaEsquecidoAberto(inicioDeHoje: Date): Promise<number> {
    return this.prisma.cashSession.count({
      where: { status: CashSessionStatus.OPEN, openedAt: { lt: inicioDeHoje } },
    });
  }
}
