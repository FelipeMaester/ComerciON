'use client';

import { FormEvent, Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import { CarregandoLista } from '@/components/Carregando';
import { ErrorNotice } from '@/components/ErrorNotice';
import { getQuoteFlowStatus } from '@/lib/quoteStatus';
import type { Customer, CustomerVehicle, Paginated, Product, Quote, QuoteStatus } from '@/lib/types';
import { formatarMoeda } from '@/lib/format';

type ItemKind = 'PART' | 'LABOR';

interface ItemDraft {
  kind: ItemKind;
  productId: string;
  description: string;
  quantity: string;
  unitPrice: string;
}

const EMPTY_ITEM: ItemDraft = { kind: 'PART', productId: '', description: '', quantity: '1', unitPrice: '' };

interface VehicleDraft {
  plate: string;
  brand: string;
  model: string;
  color: string;
  year: string;
}

const EMPTY_VEHICLE_DRAFT: VehicleDraft = { plate: '', brand: '', model: '', color: '', year: '' };

interface ApprovalNotice {
  quoteId: string;
  customerName: string;
  total: string;
}

// Não há infraestrutura de push/websocket neste projeto — o "automático" aqui
// é feito por polling da lista a cada 15s, comparando o status anterior de
// cada orçamento com o atual. Só dispara aviso na transição PENDING→APPROVED,
// então a primeira carga da página (sem histórico ainda) nunca gera aviso.
const POLL_INTERVAL_MS = 15000;

export default function QuotesPage() {
  return (
    <Suspense fallback={<CarregandoLista />}>
      <QuotesPageContent />
    </Suspense>
  );
}

function QuotesPageContent() {
  const searchParams = useSearchParams();
  // Vindo de "Gerar orçamento" numa oportunidade do Pipeline — abre o
  // formulário já com cliente/oportunidade pré-selecionados.
  const opportunityIdParam = searchParams.get('opportunityId') ?? undefined;
  const customerIdParam = searchParams.get('customerId') ?? undefined;

  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(!!opportunityIdParam);
  const [agendaOnly, setAgendaOnly] = useState(false);
  const [notices, setNotices] = useState<ApprovalNotice[]>([]);
  const prevStatusRef = useRef<Map<string, QuoteStatus> | null>(null);

  async function load(silent = false) {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const data = await api.get<Quote[]>('/quotes');

      const prev = prevStatusRef.current;
      if (prev) {
        const approved = data.filter((q) => prev.get(q.id) === 'PENDING' && q.status === 'APPROVED');
        if (approved.length > 0) {
          setNotices((n) => [
            ...n,
            ...approved.map((q) => ({
              quoteId: q.id,
              customerName: q.customer && 'name' in q.customer ? q.customer.name : 'Cliente',
              total: q.total,
            })),
          ]);
        }
      }
      prevStatusRef.current = new Map(data.map((q) => [q.id, q.status]));

      setQuotes(data);
    } catch (err) {
      if (!silent) setError(err instanceof ApiError ? err.message : 'Não foi possível carregar os orçamentos.');
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(() => load(true), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function dismissNotice(quoteId: string) {
    setNotices((n) => n.filter((notice) => notice.quoteId !== quoteId));
  }

  return (
    <div>
      {notices.length > 0 && (
        <div className="fixed right-4 top-4 z-50 w-80 space-y-2">
          {notices.map((notice) => (
            <div
              key={notice.quoteId}
              className="rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950 p-4 shadow-lg"
            >
              <div className="mb-1 flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">Orçamento aprovado!</p>
                <button
                  onClick={() => dismissNotice(notice.quoteId)}
                  className="text-emerald-700 dark:text-emerald-400 hover:text-emerald-900 dark:hover:text-emerald-200"
                >
                  ×
                </button>
              </div>
              <p className="mb-2 text-sm text-emerald-700 dark:text-emerald-400">
                {notice.customerName} aprovou o orçamento ({formatarMoeda(Number(notice.total))}). Já entrou em execução automaticamente.
              </p>
              <Link href={`/quotes/${notice.quoteId}`} className="text-sm font-medium underline text-emerald-800 dark:text-emerald-300">
                Ver detalhes
              </Link>
            </div>
          ))}
        </div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <h1 className="titulo-pagina">Orçamentos</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setAgendaOnly((v) => !v)}
            className={`rounded-lg border px-4 py-2 text-sm ${
              agendaOnly
                ? 'border-marca bg-marca-solida text-marca-texto'
                : 'border-linha hover:bg-realce'
            }`}
          >
            {agendaOnly ? 'Ver todos' : 'Ver agenda'}
          </button>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="btn-primary"
          >
            {showForm ? 'Cancelar' : 'Novo orçamento'}
          </button>
        </div>
      </div>

      {showForm && (
        <CreateQuoteForm
          initialCustomerId={customerIdParam}
          opportunityId={opportunityIdParam}
          onCreated={() => {
            setShowForm(false);
            load();
          }}
        />
      )}

      {error && <ErrorNotice message={error} />}

      {loading ? (
        <CarregandoLista />
      ) : (
        <QuotesTable quotes={quotes} agendaOnly={agendaOnly} />
      )}
    </div>
  );
}

function QuotesTable({ quotes, agendaOnly }: { quotes: Quote[]; agendaOnly: boolean }) {
  const visibleQuotes = agendaOnly
    ? quotes
        .filter((q) => q.serviceOrder?.scheduledAt)
        .sort((a, b) => new Date(a.serviceOrder!.scheduledAt!).getTime() - new Date(b.serviceOrder!.scheduledAt!).getTime())
    : quotes;

  return (
    <div className="w-full overflow-x-auto">
      <table className="tabela card">
        <thead>
          <tr>
            <th>Data</th>
            <th>Cliente</th>
            <th>Veículo</th>
            <th>Total</th>
            <th>Situação</th>
            <th>Agendado para</th>
          </tr>
        </thead>
        <tbody>
          {visibleQuotes.map((q) => {
            const flowStatus = getQuoteFlowStatus(q);
            return (
              <tr key={q.id}>
                <td className="text-xs text-suave">{new Date(q.createdAt).toLocaleString('pt-BR')}</td>
                <td>
                  <Link href={`/quotes/${q.id}`} className="text-texto hover:underline">
                    {q.customer && 'name' in q.customer ? q.customer.name : '—'}
                  </Link>
                </td>
                <td>{q.vehicle && 'plate' in q.vehicle ? q.vehicle.plate : '—'}</td>
                <td>{formatarMoeda(Number(q.total))}</td>
                <td><span className={`${flowStatus.badgeClass} whitespace-nowrap`}>{flowStatus.label}</span></td>
                <td className="text-xs text-suave">
                  {q.serviceOrder?.scheduledAt ? new Date(q.serviceOrder.scheduledAt).toLocaleString('pt-BR') : '—'}
                </td>
              </tr>
            );
          })}
          {visibleQuotes.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-6 text-center text-tenue">
                {agendaOnly ? 'Nenhum serviço agendado.' : 'Nenhum orçamento encontrado.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function CreateQuoteForm({
  onCreated,
  initialCustomerId,
  opportunityId,
}: {
  onCreated: () => void;
  initialCustomerId?: string;
  opportunityId?: string;
}) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [vehicles, setVehicles] = useState<CustomerVehicle[]>([]);

  const [customerId, setCustomerId] = useState(initialCustomerId ?? '');
  const [vehicleDraft, setVehicleDraft] = useState<VehicleDraft>(EMPTY_VEHICLE_DRAFT);
  const [description, setDescription] = useState('');
  const [items, setItems] = useState<ItemDraft[]>([]);
  const [itemDraft, setItemDraft] = useState<ItemDraft>(EMPTY_ITEM);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<Paginated<Customer>>('/customers?pageSize=100').then((d) => setCustomers(d.items)).catch(() => undefined);
    api.get<Paginated<Product>>('/products?pageSize=100').then((d) => setProducts(d.items)).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!customerId) {
      setVehicles([]);
      return;
    }
    api
      .get<Customer>(`/customers/${customerId}`)
      .then((c) => setVehicles(c.vehicles ?? []))
      .catch(() => setVehicles([]));
    setVehicleDraft(EMPTY_VEHICLE_DRAFT);
  }, [customerId]);

  function setItemKind(kind: ItemKind) {
    setItemDraft((d) => ({ ...EMPTY_ITEM, kind, quantity: d.quantity }));
  }

  function addItem() {
    if (!itemDraft.description.trim() || !itemDraft.unitPrice) return;
    setItems((prev) => [...prev, itemDraft]);
    setItemDraft({ ...EMPTY_ITEM, kind: itemDraft.kind });
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function pickProduct(productId: string) {
    const product = products.find((p) => p.id === productId);
    setItemDraft((d) => ({
      ...d,
      productId,
      description: product ? product.name : d.description,
      unitPrice: product ? product.price : d.unitPrice,
    }));
  }

  const total = items.reduce((sum, i) => sum + Number(i.quantity || 0) * Number(i.unitPrice || 0), 0);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!customerId) {
      setError('Selecione um cliente.');
      return;
    }
    if (items.length === 0) {
      setError('Adicione ao menos um item.');
      return;
    }
    setSaving(true);
    try {
      let finalVehicleId: string | undefined;
      const plate = vehicleDraft.plate.trim();
      if (plate) {
        const normalized = plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
        const existing = vehicles.find((v) => v.plate.toUpperCase().replace(/[^A-Z0-9]/g, '') === normalized);
        if (existing) {
          finalVehicleId = existing.id;
        } else {
          const vehicle = await api.post<CustomerVehicle>(`/customers/${customerId}/vehicles`, {
            plate: plate.toUpperCase(),
            brand: vehicleDraft.brand || undefined,
            model: vehicleDraft.model || undefined,
            color: vehicleDraft.color || undefined,
            year: vehicleDraft.year ? Number(vehicleDraft.year) : undefined,
          });
          finalVehicleId = vehicle.id;
        }
      }

      await api.post('/quotes', {
        customerId,
        vehicleId: finalVehicleId || undefined,
        opportunityId: opportunityId || undefined,
        description: description || undefined,
        items: items.map((i) => ({
          productId: i.productId || undefined,
          description: i.description,
          quantity: Number(i.quantity),
          unitPrice: Number(i.unitPrice),
        })),
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível criar o orçamento.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="card mb-6 grid grid-cols-1 gap-3 p-4 sm:grid-cols-2"
    >
      {opportunityId && (
        <p className="col-span-full text-xs text-blue-600 dark:text-blue-400">
          Vinculado a uma oportunidade do Pipeline — aprovar ou recusar este orçamento move ela automaticamente.
        </p>
      )}
      <select className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)} required>
        <option value="">Selecione o cliente…</option>
        {customers.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <div className="col-span-full grid grid-cols-2 gap-2 sm:grid-cols-5">
        <input
          className="input"
          placeholder="Placa do veículo (opcional)"
          value={vehicleDraft.plate}
          onChange={(e) => setVehicleDraft((v) => ({ ...v, plate: e.target.value }))}
          disabled={!customerId}
        />
        <input
          className="input"
          placeholder="Marca"
          value={vehicleDraft.brand}
          onChange={(e) => setVehicleDraft((v) => ({ ...v, brand: e.target.value }))}
          disabled={!customerId}
        />
        <input
          className="input"
          placeholder="Modelo"
          value={vehicleDraft.model}
          onChange={(e) => setVehicleDraft((v) => ({ ...v, model: e.target.value }))}
          disabled={!customerId}
        />
        <input
          className="input"
          placeholder="Cor"
          value={vehicleDraft.color}
          onChange={(e) => setVehicleDraft((v) => ({ ...v, color: e.target.value }))}
          disabled={!customerId}
        />
        <input
          className="input"
          type="number"
          step={1}
          placeholder="Ano"
          value={vehicleDraft.year}
          onChange={(e) => setVehicleDraft((v) => ({ ...v, year: e.target.value }))}
          disabled={!customerId}
        />
      </div>

      <textarea
        className="input col-span-full"
        placeholder="Problema relatado / observações (opcional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      <div className="card col-span-full space-y-2 p-3">
        <p className="text-sm font-medium">Itens (peças e/ou mão de obra)</p>

        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setItemKind('PART')}
            className={`rounded-lg px-3 py-1 text-sm ${
              itemDraft.kind === 'PART'
                ? 'bg-marca-solida text-marca-texto'
                : 'border border-linha text-suave'
            }`}
          >
            Peça
          </button>
          <button
            type="button"
            onClick={() => setItemKind('LABOR')}
            className={`rounded-lg px-3 py-1 text-sm ${
              itemDraft.kind === 'LABOR'
                ? 'bg-marca-solida text-marca-texto'
                : 'border border-linha text-suave'
            }`}
          >
            Mão de obra
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {itemDraft.kind === 'PART' && (
            <select className="input sm:col-span-1" value={itemDraft.productId} onChange={(e) => pickProduct(e.target.value)}>
              <option value="">Peça (opcional)</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          <input
            className={`input ${itemDraft.kind === 'PART' ? 'sm:col-span-2' : 'sm:col-span-3'}`}
            placeholder={itemDraft.kind === 'PART' ? 'Descrição*' : 'Descrição do serviço*'}
            value={itemDraft.description}
            onChange={(e) => setItemDraft((d) => ({ ...d, description: e.target.value }))}
          />
          <input
            className="input"
            type="number"
            step={1}
            min={1}
            placeholder="Qtd"
            value={itemDraft.quantity}
            onChange={(e) => setItemDraft((d) => ({ ...d, quantity: e.target.value }))}
          />
          <input
            className="input"
            type="number"
            step="0.01"
            min={0}
            placeholder="Preço unit."
            value={itemDraft.unitPrice}
            onChange={(e) => setItemDraft((d) => ({ ...d, unitPrice: e.target.value }))}
          />
        </div>
        <button type="button" onClick={addItem} className="btn-secondary">
          Adicionar item
        </button>

        {items.length > 0 && (
          <ul className="space-y-1">
            {items.map((item, index) => (
              <li
                key={index}
                className="flex items-center justify-between rounded-lg bg-realce px-3 py-1.5 text-sm text-texto"
              >
                <span>
                  {item.quantity}x {item.description} — {formatarMoeda(Number(item.unitPrice))}
                </span>
                <button
                  type="button"
                  onClick={() => removeItem(index)}
                  className="text-tenue hover:text-red-600"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        {items.length > 0 && <p className="text-right text-sm font-medium">Total: {formatarMoeda(total)}</p>}
      </div>

      {error && <p className="col-span-full text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="col-span-full">
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Salvando…' : 'Salvar orçamento'}
        </button>
      </div>
    </form>
  );
}
