'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api-client';
import type { AdminTenant, Plan, TenantStatus } from '@/lib/types';

const STATUS_LABEL: Record<TenantStatus, string> = {
  TRIAL: 'Trial',
  ACTIVE: 'Ativo',
  SUSPENDED: 'Suspenso',
  CANCELED: 'Cancelado',
};

export default function AdminTenantsPage() {
  const [tenants, setTenants] = useState<AdminTenant[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const [tenantList, planList] = await Promise.all([
        api.get<AdminTenant[]>('/admin/tenants'),
        api.get<Plan[]>('/billing/plans'),
      ]);
      setTenants(tenantList);
      setPlans(planList);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar os tenants.');
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleStatus(tenant: AdminTenant) {
    const nextStatus = tenant.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
    setBusyId(tenant.id);
    setError(null);
    try {
      await api.patch(`/admin/tenants/${tenant.id}/status`, { status: nextStatus });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível atualizar o status.');
    } finally {
      setBusyId(null);
    }
  }

  async function changePlan(tenant: AdminTenant, planKey: string) {
    setBusyId(tenant.id);
    setError(null);
    try {
      await api.put(`/admin/tenants/${tenant.id}/plan`, { planKey });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível trocar o plano.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <h1 className="mb-2 titulo-pagina">Administração — Tenants</h1>
      <p className="mb-6 text-sm text-suave">
        Visão de plataforma — todos os tenants cadastrados, além do seu próprio.
      </p>

      {error && <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="w-full overflow-x-auto">
        <table className="tabela card">
          <thead>
            <tr>
              <th>Empresa</th>
              <th>Identificador</th>
              <th>Usuários</th>
              <th>Plano</th>
              <th>Situação</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {tenants.map((tenant) => (
              <tr key={tenant.id}>
                <td>{tenant.name}</td>
                <td className="font-mono text-xs">{tenant.slug}</td>
                <td>{tenant._count?.users ?? '—'}</td>
                <td>
                  <select
                    className="input"
                    value={tenant.subscription?.plan.key ?? ''}
                    disabled={busyId === tenant.id}
                    onChange={(e) => changePlan(tenant, e.target.value)}
                  >
                    <option value="" disabled>
                      Sem plano
                    </option>
                    {plans.map((plan) => (
                      <option key={plan.key} value={plan.key}>
                        {plan.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>{STATUS_LABEL[tenant.status]}</td>
                <td className="text-right">
                  <button onClick={() => toggleStatus(tenant)} disabled={busyId === tenant.id} className="btn-secondary text-xs">
                    {tenant.status === 'SUSPENDED' ? 'Reativar' : 'Suspender'}
                  </button>
                </td>
              </tr>
            ))}
            {tenants.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-tenue">
                  Nenhum tenant cadastrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
