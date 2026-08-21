'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api-client';
import type { AdminTenant, Plan, TenantStatus } from '@/lib/types';

const SITUACAO: Record<TenantStatus, string> = {
  TRIAL: 'Avaliação',
  ACTIVE: 'Ativa',
  SUSPENDED: 'Suspensa',
  CANCELED: 'Cancelada',
};

export default function AdminTenantsPage() {
  const [tenants, setTenants] = useState<AdminTenant[]>([]);
  const [total, setTotal] = useState(0);
  const [busca, setBusca] = useState('');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  /** A loja cuja exclusão está sendo confirmada, e o que já foi digitado. */
  const [excluindo, setExcluindo] = useState<AdminTenant | null>(null);
  const [confirmacao, setConfirmacao] = useState('');

  async function load(termo = busca) {
    setError(null);
    try {
      const query = termo ? `?search=${encodeURIComponent(termo)}` : '';
      const [lista, planList] = await Promise.all([
        api.get<{ items: AdminTenant[]; total: number }>(`/admin/tenants${query}`),
        api.get<Plan[]>('/billing/plans'),
      ]);
      setTenants(lista.items);
      setTotal(lista.total);
      setPlans(planList);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar as lojas.');
    }
  }

  useEffect(() => {
    load('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleStatus(tenant: AdminTenant) {
    const nextStatus = tenant.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
    setBusyId(tenant.id);
    setError(null);
    try {
      await api.patch(`/admin/tenants/${tenant.id}/status`, { status: nextStatus });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível atualizar a situação.');
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

  /**
   * Exclui de verdade — não tem desfazer, e por isso não tem atalho.
   *
   * A API exige o identificador da loja repetido no corpo; a tela exige o
   * mesmo antes de habilitar o botão. Não é redundância boba: o servidor
   * protege contra chamada errada de qualquer origem, e a tela protege contra
   * o clique distraído de quem está com trinta lojas na frente.
   */
  async function excluir(tenant: AdminTenant) {
    setBusyId(tenant.id);
    setError(null);
    try {
      await api.delete(`/admin/tenants/${tenant.id}`, { slug: confirmacao });
      setExcluindo(null);
      setConfirmacao('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível excluir a loja.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <h1 className="mb-2 titulo-pagina">Administração — Lojas</h1>
      <p className="mb-4 text-sm text-suave">Visão de plataforma — todas as lojas cadastradas, além da sua.</p>

      <form
        className="mb-4 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
      >
        <input
          className="input max-w-xs"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou identificador"
          aria-label="Buscar loja"
        />
        <button type="submit" className="btn-secondary">
          Buscar
        </button>
        {busca && (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setBusca('');
              load('');
            }}
          >
            Limpar
          </button>
        )}
        {/* Diz o recorte em vez de deixar parecer que são todas: com duas mil
            lojas, mostrar cinquenta sem avisar é a tela mentindo em silêncio. */}
        {total > tenants.length && (
          <span className="text-xs text-tenue">
            Mostrando {tenants.length} de {total}. Use a busca para chegar à loja que procura.
          </span>
        )}
      </form>

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
                <td>{SITUACAO[tenant.status]}</td>
                <td className="text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => toggleStatus(tenant)}
                      disabled={busyId === tenant.id}
                      className="btn-secondary text-xs"
                    >
                      {tenant.status === 'SUSPENDED' ? 'Reativar' : 'Suspender'}
                    </button>
                    <button
                      onClick={() => {
                        setExcluindo(tenant);
                        setConfirmacao('');
                        setError(null);
                      }}
                      disabled={busyId === tenant.id}
                      className="rounded-md border border-red-500/40 px-2.5 py-1 text-xs text-red-700 transition hover:bg-red-500/10 dark:text-red-400"
                    >
                      Excluir
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {tenants.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-tenue">
                  {busca ? `Nenhuma loja encontrada para "${busca}".` : "Nenhuma loja cadastrada."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* A confirmação fica na própria tela, e não num `confirm` do navegador:
          aqui dá para mostrar o que será perdido e exigir o identificador
          digitado, que é o que separa a decisão do clique. */}
      {excluindo && (
        <div className="card mt-5 border-red-500/40 p-4">
          <h2 className="text-sm font-semibold text-red-700 dark:text-red-400">
            Excluir a loja {excluindo.name}
          </h2>
          <p className="mt-2 text-sm text-suave">
            Apaga a loja e tudo que pertence a ela — vendas, clientes, estoque, financeiro, usuários. Não tem como
            desfazer, e não há backup dentro do sistema.
          </p>
          <p className="mt-3 text-sm text-suave">
            Para confirmar, digite <strong className="font-mono text-texto">{excluindo.slug}</strong> abaixo.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              className="input font-mono"
              value={confirmacao}
              onChange={(e) => setConfirmacao(e.target.value)}
              placeholder={excluindo.slug}
              aria-label={`Identificador da loja ${excluindo.name}`}
              autoFocus
            />
            <button
              onClick={() => excluir(excluindo)}
              disabled={confirmacao !== excluindo.slug || busyId === excluindo.id}
              className="btn-primary bg-red-600 text-white hover:bg-red-700 disabled:opacity-40"
            >
              {busyId === excluindo.id ? 'Excluindo…' : 'Excluir para sempre'}
            </button>
            <button
              onClick={() => {
                setExcluindo(null);
                setConfirmacao('');
              }}
              disabled={busyId === excluindo.id}
              className="btn-secondary"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
