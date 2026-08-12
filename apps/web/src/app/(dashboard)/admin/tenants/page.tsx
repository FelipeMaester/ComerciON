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
      <h1 className="mb-2 text-xl font-semibold">Administração — Tenants</h1>
      <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
        Visão de plataforma — todos os tenants cadastrados, além do seu próprio.
      </p>

      {error && <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="w-full overflow-x-auto">
        <table className="w-full overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800 text-left text-slate-500 dark:text-slate-400">
            <tr>
              <th className="px-4 py-2">Empresa</th>
              <th className="px-4 py-2">Identificador</th>
              <th className="px-4 py-2">Usuários</th>
              <th className="px-4 py-2">Plano</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {tenants.map((tenant) => (
              <tr key={tenant.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-4 py-2">{tenant.name}</td>
                <td className="px-4 py-2 font-mono text-xs">{tenant.slug}</td>
                <td className="px-4 py-2">{tenant._count?.users ?? '—'}</td>
                <td className="px-4 py-2">
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
                <td className="px-4 py-2">{STATUS_LABEL[tenant.status]}</td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => toggleStatus(tenant)} disabled={busyId === tenant.id} className="btn-secondary text-xs">
                    {tenant.status === 'SUSPENDED' ? 'Reativar' : 'Suspender'}
                  </button>
                </td>
              </tr>
            ))}
            {tenants.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400 dark:text-slate-500">
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
