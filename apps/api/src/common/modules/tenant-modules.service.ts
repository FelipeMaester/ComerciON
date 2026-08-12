import { Injectable } from '@nestjs/common';
import { ModuleKey, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

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
 * Regra herdada do ModulesGuard: tenant SEM assinatura mantém acesso total —
 * são os provisionados à mão e os que existem desde antes dos planos. Só passa
 * a ser restrito a partir do momento em que assina um plano de verdade.
 */
@Injectable()
export class TenantModulesService {
  constructor(private readonly prisma: PrismaService) {}

  async getForTenant(tenantId: string | undefined): Promise<TenantModulesResult> {
    const all = Object.values(ModuleKey);
    if (!tenantId) return { modules: all, planName: null, canceled: false };

    const subscription = await this.prisma.subscription.findUnique({
      where: { tenantId },
      include: { plan: true },
    });
    if (!subscription) return { modules: all, planName: null, canceled: false };

    if (subscription.status === SubscriptionStatus.CANCELED) {
      return { modules: [], planName: subscription.plan.name, canceled: true };
    }

    return { modules: subscription.plan.modules, planName: subscription.plan.name, canceled: false };
  }

  /** Atalho usado pelo gate da API. */
  async isEnabled(tenantId: string | undefined, required: ModuleKey): Promise<boolean> {
    const { modules } = await this.getForTenant(tenantId);
    return modules.includes(required);
  }
}
