'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api-client';
import { PrintToolbar } from '@/components/print/PrintToolbar';
import type { CustomerVehicle, ServiceOrder, TenantSettings } from '@/lib/types';

const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Aberta',
  IN_PROGRESS: 'Em andamento',
  DONE: 'Concluída',
  CANCELED: 'Cancelada',
};

const brl = (v: number | string) =>
  Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Ordem de serviço em A4.
 *
 * Sai em folha inteira, e não em bobina, porque este papel tem outra função:
 * o cliente assina autorizando o serviço, e a via costuma ficar arquivada na
 * oficina. Por isso leva os dados do veículo e a linha de assinatura.
 */
export default function PrintServiceOrderPage() {
  const params = useParams<{ id: string }>();
  const [order, setOrder] = useState<ServiceOrder | null>(null);
  const [store, setStore] = useState<TenantSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.get<ServiceOrder>(`/service-orders/${params.id}`), api.get<TenantSettings>('/settings')])
      .then(([orderData, storeData]) => {
        setOrder(orderData);
        setStore(storeData);
      })
      .catch(() => setError('Não foi possível carregar a ordem de serviço.'));
  }, [params.id]);

  if (error) return <p className="print-center">{error}</p>;
  if (!order || !store) return <p className="print-center">Carregando…</p>;

  // O tipo do veículo é uma união (às vezes só a placa vem na listagem), então
  // as demais informações são lidas defensivamente.
  const vehicle = order.vehicle as Partial<CustomerVehicle> | null | undefined;
  const customer = order.customer as { name: string; phone?: string | null } | undefined;

  return (
    <>
      <PrintToolbar ready />

      <div className="print-page print-page--a4">
        <div className="print-row" style={{ alignItems: 'flex-start' }}>
          <div>
            <div className="print-bold" style={{ fontSize: 18 }}>
              {store.name}
            </div>
            {store.document && <div className="print-muted">CNPJ {store.document}</div>}
            {store.addressLine && <div className="print-muted">{store.addressLine}</div>}
            {store.phone && <div className="print-muted">Tel: {store.phone}</div>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="print-bold" style={{ fontSize: 16 }}>
              ORDEM DE SERVIÇO
            </div>
            <div>Nº {order.id.slice(0, 8).toUpperCase()}</div>
            <div className="print-muted">{new Date(order.createdAt).toLocaleDateString('pt-BR')}</div>
            <div className="print-muted">{STATUS_LABEL[order.status] ?? order.status}</div>
          </div>
        </div>

        <hr className="print-hr" />

        <div className="print-row">
          <div>
            <div className="print-bold">Cliente</div>
            <div>{customer?.name ?? '—'}</div>
            {customer?.phone && <div className="print-muted">{customer.phone}</div>}
          </div>
          {vehicle?.plate && (
            <div style={{ textAlign: 'right' }}>
              <div className="print-bold">Veículo</div>
              <div>
                {[vehicle.brand, vehicle.model].filter(Boolean).join(' ') || 'Veículo'}
                {vehicle.year ? ` ${vehicle.year}` : ''}
              </div>
              <div className="print-muted">
                Placa {vehicle.plate}
                {vehicle.color ? ` · ${vehicle.color}` : ''}
              </div>
            </div>
          )}
        </div>

        {order.scheduledAt && (
          <div style={{ marginTop: 8 }}>
            <span className="print-bold">Agendado para: </span>
            {new Date(order.scheduledAt).toLocaleString('pt-BR')}
          </div>
        )}

        {order.description && (
          <div style={{ marginTop: 8 }}>
            <div className="print-bold">Descrição</div>
            <div>{order.description}</div>
          </div>
        )}

        <hr className="print-hr" />

        <table className="print-table">
          <thead>
            <tr>
              <th>Item / Serviço</th>
              <th className="num">Qtd</th>
              <th className="num">Unit.</th>
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={item.id}>
                <td>{item.description || item.product?.name || 'Item'}</td>
                <td className="num">{item.quantity}</td>
                <td className="num">{brl(item.unitPrice)}</td>
                <td className="num">{brl(Number(item.unitPrice) * item.quantity)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <hr className="print-hr" />

        <div className="print-row print-bold" style={{ fontSize: 15 }}>
          <span>TOTAL</span>
          <span>{brl(order.total)}</span>
        </div>

        <p className="print-muted" style={{ marginTop: 16, fontSize: 11 }}>
          Autorizo a execução dos serviços e a aplicação das peças descritas acima, pelos valores apresentados.
        </p>

        <div className="print-signature">
          <div style={{ fontSize: 11 }}>{customer?.name ?? 'Assinatura do cliente'}</div>
          <div className="print-muted" style={{ fontSize: 10 }}>
            Assinatura do cliente · Data ____ / ____ / ______
          </div>
        </div>
      </div>
    </>
  );
}
