import { Injectable, Logger } from '@nestjs/common';
import { ModuleKey, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Plano gratuito, usado como piso de acesso quando não há assinatura. */
const PLANO_PISO = 'trial';

export interface TenantModulesResult {
  /** Módulos que este tenant pode usar agora. */
  modules: ModuleKey[];
  /** Nome do plano, para a tela poder dizer "não incluído no plano Trial". */
  planName: string | null;
  /** Assinatura cancelada: o acesso está bloqueado até reativar. */
  canceled: boolean;
}

/**
 * Fonte ÚNICA da resposta "quais módulos este tenant pode usar".
 *
 * Existe para o menu e o gate da API nunca discordarem. Se o cálculo ficasse
 * duplicado, o resultado seria o pior tipo de bug de produto: um item de menu
 * que leva a um 403, ou um recurso pago que aparece de graça.
 *
 * Tenant SEM assinatura cai no plano gratuito, não em acesso total.
 *
 * Antes era o contrário — "sem assinatura, libera tudo" —, pensando nos
 * tenants provisionados à mão. Só que a falta de assinatura não é um estado
 * pedido por ninguém: é o que sobra quando algo deu errado. E dava: bastava
 * mandar um `planKey` inexistente no cadastro self-service para o erro ser
 * engolido, o tenant nascer sem assinatura e receber TREZE módulos — um a
 * mais que o Premium, de graça, para sempre. Medido.
 *
 * Quem precisa de acesso além do gratuito recebe um plano pelo painel de
 * super-admin, que é explícito e fica registrado.
 */
@Injectable()
export class TenantModulesService {
  private readonly logger = new Logger(TenantModulesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getForTenant(tenantId: string | undefined): Promise<TenantModulesResult> {
    const all = Object.values(ModuleKey);
    // Sem tenant no contexto não há o que restringir: são as rotas públicas e
    // as do super-admin, que têm o próprio controle de acesso.
    if (!tenantId) return { modules: all, planName: null, canceled: false };

    const subscription = await this.prisma.subscription.findUnique({
      where: { tenantId },
      include: { plan: true },
    });
    if (!subscription) return this.piso(tenantId, all);

    if (subscription.status === SubscriptionStatus.CANCELED) {
      return { modules: [], planName: subscription.plan.name, canceled: true };
    }

    return { modules: subscription.plan.modules, planName: subscription.plan.name, canceled: false };
  }

  /**
   * O que um tenant sem assinatura pode usar: o plano gratuito.
   *
   * Se nem o plano gratuito existir no banco, aí sim libera tudo — é um banco
   * ainda não provisionado, e travar o sistema inteiro por causa disso seria
   * pior que o buraco que estamos fechando. O aviso no log é o que faz esse
   * caso aparecer em vez de passar despercebido.
   */
  private async piso(tenantId: string, todos: ModuleKey[]): Promise<TenantModulesResult> {
    const gratuito = await this.prisma.plan.findUnique({ where: { key: PLANO_PISO } });
    if (!gratuito) {
      this.logger.warn(`Tenant ${tenantId} sem assinatura e sem plano "${PLANO_PISO}" cadastrado — liberando tudo.`);
      return { modules: todos, planName: null, canceled: false };
    }
    return { modules: gratuito.modules, planName: gratuito.name, canceled: false };
  }

  /** Atalho usado pelo gate da API. */
  async isEnabled(tenantId: string | undefined, required: ModuleKey): Promise<boolean> {
    const { modules } = await this.getForTenant(tenantId);
    return modules.includes(required);
  }
}
