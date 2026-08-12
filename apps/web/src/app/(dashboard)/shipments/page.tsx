'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api-client';
import { ErrorNotice } from '@/components/ErrorNotice';
import type { Sale, Shipment, ShipmentStatus } from '@/lib/types';

/** O que GET /logistics/shipments devolve: o envio com a venda e o cliente. */
type ShipmentWithSale = Shipment & {
  sale: { id: string; customer: { id: string; name: string } | null };
};

const STATUS_LABEL: Record<ShipmentStatus, string> = {
  PENDING: 'Aguardando',
  PROCESSING: 'Separando',
  SHIPPED: 'Despachado',
  IN_TRANSIT: 'Em trânsito',
  DELIVERED: 'Entregue',
  RETURNED: 'Devolvido',
};

/**
 * O status só avança (regra do ShipmentsService), exceto por RETURNED, que
 * pode acontecer a qualquer momento. Espelhamos isso aqui para a tela não
 * oferecer um botão que a API vai recusar.
 */
const PROGRESSION: ShipmentStatus[] = ['PENDING', 'PROCESSING', 'SHIPPED', 'IN_TRANSIT', 'DELIVERED'];

function nextStatuses(current: ShipmentStatus): ShipmentStatus[] {
  if (current === 'RETURNED') return [];
  if (current === 'DELIVERED') return ['RETURNED'];
  const index = PROGRESSION.indexOf(current);
  return [...PROGRESSION.slice(index + 1), 'RETURNED'];
}

export default function ShipmentsPage() {
  const [toDispatch, setToDispatch] = useState<Sale[]>([]);
  const [shipped, setShipped] = useState<ShipmentWithSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      // Duas listas complementares: o romaneio traz os pedidos online
      // confirmados que ainda NÃO viraram envio; a outra traz os envios já
      // criados que ainda estão em movimento.
      const [dispatch, shipments] = await Promise.all([
        api.get<Sale[]>('/logistics/dispatch-list'),
        api.get<ShipmentWithSale[]>('/logistics/shipments'),
      ]);
      setToDispatch(dispatch);
      setShipped(shipments);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar a expedição.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function advance(saleId: string, status: ShipmentStatus) {
    try {
      await api.patch(`/logistics/shipments/sales/${saleId}/status`, { status });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível atualizar o envio.');
    }
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Expedição</h1>

      {error && <ErrorNotice message={error} />}

      {loading ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Carregando…</p>
      ) : (
        <>
          <section className="mb-8">
            <h2 className="mb-1 text-sm font-medium">Romaneio — a separar ({toDispatch.length})</h2>
            <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
              Pedidos da loja virtual já confirmados que ainda não viraram envio.
            </p>

            <div className="space-y-3">
              {toDispatch.map((sale) => (
                <DispatchCard key={sale.id} sale={sale} onCreated={load} />
              ))}
              {toDispatch.length === 0 && (
                <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-400 dark:border-slate-700 dark:text-slate-500">
                  Nada para separar.
                </p>
              )}
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-medium">Envios em andamento ({shipped.length})</h2>
            <div className="w-full overflow-x-auto">
              <table className="w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm dark:border-slate-700 dark:bg-slate-900">
                <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-2">Pedido</th>
                    <th className="px-4 py-2">Cliente</th>
                    <th className="px-4 py-2">Transportadora</th>
                    <th className="px-4 py-2">Rastreio</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2">Avançar para</th>
                  </tr>
                </thead>
                <tbody>
                  {shipped.map((shipment) => (
                    <tr key={shipment.id} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-4 py-2">
                        <Link href={`/sales/${shipment.sale.id}`} className="font-mono text-xs hover:underline">
                          {shipment.sale.id.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="px-4 py-2">{shipment.sale.customer?.name ?? '—'}</td>
                      <td className="px-4 py-2">{shipment.carrier ?? '—'}</td>
                      <td className="px-4 py-2 font-mono text-xs">{shipment.trackingCode ?? '—'}</td>
                      <td className="px-4 py-2">{STATUS_LABEL[shipment.status]}</td>
                      <td className="px-4 py-2">
                        <div className="flex flex-wrap gap-2">
                          {nextStatuses(shipment.status).map((s) => (
                            <button
                              key={s}
                              onClick={() => advance(shipment.sale.id, s)}
                              className={`rounded border px-2 py-1 text-xs ${
                                s === 'RETURNED'
                                  ? 'border-red-300 text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950'
                                  : 'border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'
                              }`}
                            >
                              {STATUS_LABEL[s]}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {shipped.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-slate-400 dark:text-slate-500">
                        Nenhum envio em andamento.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function DispatchCard({ sale, onCreated }: { sale: Sale; onCreated: () => void }) {
  const [carrier, setCarrier] = useState('');
  const [trackingCode, setTrackingCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post(`/logistics/shipments/sales/${sale.id}`, {
        carrier: carrier.trim() || undefined,
        trackingCode: trackingCode.trim() || undefined,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível criar o envio.');
      setSaving(false);
    }
  }

  const address = sale.shippingAddress;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link href={`/sales/${sale.id}`} className="font-mono text-xs text-slate-500 hover:underline dark:text-slate-400">
            {sale.id.slice(0, 8)}
          </Link>
          <p className="font-medium">{sale.customer?.name ?? 'Cliente não identificado'}</p>
          {address && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {address.street}, {address.number}
              {address.complement ? ` — ${address.complement}` : ''} · {address.city}/{address.state} · CEP {address.zipCode}
            </p>
          )}
        </div>
        <p className="text-sm font-medium">R$ {Number(sale.total).toFixed(2)}</p>
      </div>

      {/* A lista de itens é o que a pessoa lê enquanto separa a mercadoria —
          por isso vem antes do formulário, não escondida atrás de um clique. */}
      <ul className="mb-3 space-y-1 rounded bg-slate-50 p-3 text-sm dark:bg-slate-800">
        {sale.items?.map((item) => (
          <li key={item.id} className="flex justify-between">
            <span>
              <span className="font-medium">{item.quantity}x</span> {item.product?.name ?? item.description ?? 'Item'}
            </span>
            {item.product?.sku && <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{item.product.sku}</span>}
          </li>
        ))}
      </ul>

      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
        <input className="input flex-1" placeholder="Transportadora" value={carrier} onChange={(e) => setCarrier(e.target.value)} />
        <input className="input flex-1" placeholder="Código de rastreio" value={trackingCode} onChange={(e) => setTrackingCode(e.target.value)} />
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Criando…' : 'Criar envio'}
        </button>
      </form>

      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
