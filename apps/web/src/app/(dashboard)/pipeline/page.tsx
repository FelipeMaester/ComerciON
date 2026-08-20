'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DndContext, DragEndEvent, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import { api, ApiError } from '@/lib/api-client';
import { CarregandoLista } from '@/components/Carregando';
import { ErrorNotice } from '@/components/ErrorNotice';
import type { Customer, Paginated, Opportunity, PipelineStage } from '@/lib/types';
import { formatarMoeda } from '@/lib/format';

function daysSince(dateStr: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / (24 * 60 * 60 * 1000)));
}

export default function PipelinePage() {
  const router = useRouter();
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function load() {
    try {
      const [stagesData, opportunitiesData] = await Promise.all([
        api.get<PipelineStage[]>('/pipeline-stages'),
        api.get<Opportunity[]>('/opportunities'),
      ]);
      setStages([...stagesData].sort((a, b) => a.order - b.order));
      setOpportunities(opportunitiesData);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar o funil de vendas.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    api.get<Paginated<Customer>>('/customers?pageSize=100').then((d) => setCustomers(d.items)).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const opportunityId = String(active.id);
    const targetStageId = String(over.id);
    const opportunity = opportunities.find((o) => o.id === opportunityId);
    if (!opportunity || opportunity.stageId === targetStageId) return;

    // Atualização otimista — o card já pula pra coluna nova enquanto o PATCH
    // roda ao fundo; se falhar, o load() no catch corrige a UI.
    setOpportunities((prev) => prev.map((o) => (o.id === opportunityId ? { ...o, stageId: targetStageId } : o)));
    try {
      await api.patch(`/opportunities/${opportunityId}/stage`, { stageId: targetStageId });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível mover a oportunidade.');
      load();
    }
  }

  if (loading) return <CarregandoLista />;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="titulo-pagina">Funil de vendas</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="btn-primary"
        >
          {showForm ? 'Cancelar' : 'Nova oportunidade'}
        </button>
      </div>

      {showForm && (
        <NewOpportunityForm
          customers={customers}
          stages={stages}
          onCreated={() => {
            setShowForm(false);
            load();
          }}
        />
      )}

      {error && <ErrorNotice message={error} />}

      {stages.length === 0 ? (
        <p className="text-sm text-tenue">Nenhuma etapa de funil configurada para este tenant.</p>
      ) : (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {stages.map((stage) => (
              <PipelineColumn
                key={stage.id}
                stage={stage}
                opportunities={opportunities.filter((o) => o.stageId === stage.id)}
                onGenerateQuote={(o) => router.push(`/quotes?opportunityId=${o.id}&customerId=${o.customerId}`)}
              />
            ))}
          </div>
        </DndContext>
      )}
    </div>
  );
}

function PipelineColumn({
  stage,
  opportunities,
  onGenerateQuote,
}: {
  stage: PipelineStage;
  opportunities: Opportunity[];
  onGenerateQuote: (o: Opportunity) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const totalValue = opportunities.reduce((sum, o) => sum + Number(o.estimatedValue ?? 0), 0);

  return (
    <div
      ref={setNodeRef}
      className={`flex w-72 shrink-0 flex-col rounded-lg border p-3 transition-colors ${
        isOver
          ? 'border-marca/60 bg-marca/5'
          : 'card'
      }`}
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-medium">{stage.name}</span>
        <span className="text-xs text-tenue">{opportunities.length}</span>
      </div>
      <p className="mb-3 text-xs text-tenue">{formatarMoeda(totalValue)}</p>
      <div className="min-h-[40px] space-y-2">
        {opportunities.map((o) => (
          <OpportunityCard key={o.id} opportunity={o} onGenerateQuote={() => onGenerateQuote(o)} />
        ))}
      </div>
    </div>
  );
}

function OpportunityCard({ opportunity, onGenerateQuote }: { opportunity: Opportunity; onGenerateQuote: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: opportunity.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 10 } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`cursor-grab touch-none rounded-lg border border-linha bg-superficie p-2 text-sm shadow-sm active:cursor-grabbing ${
        isDragging ? 'opacity-50' : ''
      }`}
    >
      <p className="font-medium">{opportunity.title}</p>
      <p className="text-xs text-suave">{opportunity.customer?.name ?? 'Cliente'}</p>
      {opportunity.estimatedValue && (
        <p className="text-xs text-suave">{formatarMoeda(Number(opportunity.estimatedValue))}</p>
      )}
      {opportunity.responsible && <p className="text-xs text-tenue">Resp.: {opportunity.responsible.name}</p>}
      {opportunity.tags.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {opportunity.tags.map((tag) => (
            <span key={tag} className="rounded bg-realce px-1.5 py-0.5 text-[10px] text-suave">
              {tag}
            </span>
          ))}
        </div>
      )}
      <p className="mt-1 text-[10px] text-tenue">{daysSince(opportunity.stageChangedAt)}d nesta etapa</p>
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onGenerateQuote}
        className="mt-2 text-xs text-blue-600 dark:text-blue-400 hover:underline"
      >
        Gerar orçamento
      </button>
    </div>
  );
}

function NewOpportunityForm({
  customers,
  stages,
  onCreated,
}: {
  customers: Customer[];
  stages: PipelineStage[];
  onCreated: () => void;
}) {
  const [customerId, setCustomerId] = useState('');
  const [title, setTitle] = useState('');
  const [estimatedValue, setEstimatedValue] = useState('');
  const [stageId, setStageId] = useState('');
  const [source, setSource] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!customerId || !title.trim()) {
      setError('Selecione um cliente e informe um título.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/opportunities', {
        customerId,
        title,
        estimatedValue: estimatedValue ? Number(estimatedValue) : undefined,
        stageId: stageId || undefined,
        source: source || undefined,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível criar a oportunidade.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="card mb-6 grid grid-cols-1 gap-3 p-4 sm:grid-cols-2"
    >
      <select className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)} required>
        <option value="">Selecione o cliente…</option>
        {customers.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <select className="input" value={stageId} onChange={(e) => setStageId(e.target.value)}>
        <option value="">Etapa inicial (padrão: {stages[0]?.name ?? '—'})</option>
        {stages.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <input
        className="input sm:col-span-2"
        placeholder="Título da oportunidade*"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <input
        className="input"
        type="number"
        min={0}
        step="0.01"
        placeholder="Valor estimado (R$)"
        value={estimatedValue}
        onChange={(e) => setEstimatedValue(e.target.value)}
      />
      <input className="input" placeholder="Origem (ex.: WhatsApp)" value={source} onChange={(e) => setSource(e.target.value)} />

      {error && <p className="col-span-full text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="col-span-full">
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Salvando…' : 'Salvar oportunidade'}
        </button>
      </div>
    </form>
  );
}
