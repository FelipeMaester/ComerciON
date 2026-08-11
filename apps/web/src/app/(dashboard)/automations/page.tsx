'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api-client';
import { ErrorNotice } from '@/components/ErrorNotice';
import type { AppUser, AutomationAction, AutomationRule, AutomationRunLog, AutomationTrigger } from '@/lib/types';

const TIME_BASED_TRIGGERS = new Set<AutomationTrigger>(['QUOTE_PENDING_DAYS', 'OPPORTUNITY_STALE_DAYS']);

const TRIGGER_LABEL: Record<AutomationTrigger, string> = {
  QUOTE_PENDING_DAYS: 'Orçamento parado há X dias',
  OPPORTUNITY_STALE_DAYS: 'Oportunidade parada há X dias',
  SALE_CONFIRMED: 'Venda confirmada',
  OPPORTUNITY_WON: 'Oportunidade ganha',
  OPPORTUNITY_LOST: 'Oportunidade perdida',
};

const ACTION_LABEL: Record<AutomationAction, string> = {
  SEND_WHATSAPP: 'Enviar WhatsApp',
  CREATE_TASK: 'Criar tarefa',
};

export default function AutomationsPage() {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [expandedRuleId, setExpandedRuleId] = useState<string | null>(null);

  async function load() {
    try {
      const [ruleData, userData] = await Promise.all([api.get<AutomationRule[]>('/automation-rules'), api.get<AppUser[]>('/users')]);
      setRules(ruleData);
      setUsers(userData);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar as automações.');
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleActive(rule: AutomationRule) {
    await api.patch(`/automation-rules/${rule.id}`, { isActive: !rule.isActive });
    load();
  }

  if (error) return <ErrorNotice message={error} compact={false} />;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Automações</h1>
        <button onClick={() => setShowForm((v) => !v)} className="btn-primary">
          {showForm ? 'Cancelar' : 'Nova automação'}
        </button>
      </div>

      {showForm && (
        <CreateRuleForm
          users={users}
          onCreated={() => {
            setShowForm(false);
            load();
          }}
        />
      )}

      <ul className="space-y-2">
        {rules.map((rule) => (
          <li key={rule.id} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium text-slate-900 dark:text-slate-100">{rule.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {TRIGGER_LABEL[rule.trigger]}
                  {TIME_BASED_TRIGGERS.has(rule.trigger) && rule.triggerConfig?.days ? ` (${rule.triggerConfig.days} dias)` : ''}
                  {' → '}
                  {ACTION_LABEL[rule.action]}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <button
                  onClick={() => setExpandedRuleId((id) => (id === rule.id ? null : rule.id))}
                  className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                >
                  {expandedRuleId === rule.id ? 'Ocultar execuções' : 'Ver execuções'}
                </button>
                <button
                  onClick={() => toggleActive(rule)}
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    rule.isActive
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                  }`}
                >
                  {rule.isActive ? 'Ativa' : 'Inativa'}
                </button>
              </div>
            </div>
            {expandedRuleId === rule.id && <RuleRuns ruleId={rule.id} />}
          </li>
        ))}
        {rules.length === 0 && <p className="text-sm text-slate-400 dark:text-slate-500">Nenhuma automação criada ainda.</p>}
      </ul>
    </div>
  );
}

function RuleRuns({ ruleId }: { ruleId: string }) {
  const [runs, setRuns] = useState<AutomationRunLog[] | null>(null);

  useEffect(() => {
    api
      .get<AutomationRunLog[]>(`/automation-rules/${ruleId}/runs`)
      .then(setRuns)
      .catch(() => setRuns([]));
  }, [ruleId]);

  if (!runs) return <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">Carregando execuções…</p>;
  if (runs.length === 0) return <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">Essa regra ainda não disparou nenhuma vez.</p>;

  return (
    <ul className="mt-2 space-y-1 border-t border-slate-100 dark:border-slate-800 pt-2">
      {runs.map((run) => (
        <li key={run.id} className="text-xs text-slate-500 dark:text-slate-400">
          {new Date(run.firedAt).toLocaleString('pt-BR')} — {run.entityType} — {run.success ? (
            <span className="text-emerald-600 dark:text-emerald-400">sucesso</span>
          ) : (
            <span className="text-red-600 dark:text-red-400">falhou: {run.error}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function CreateRuleForm({ users, onCreated }: { users: AppUser[]; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [trigger, setTrigger] = useState<AutomationTrigger>('QUOTE_PENDING_DAYS');
  const [days, setDays] = useState('3');
  const [action, setAction] = useState<AutomationAction>('SEND_WHATSAPP');
  const [messageTemplate, setMessageTemplate] = useState('');
  const [titleTemplate, setTitleTemplate] = useState('');
  const [assignToId, setAssignToId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post('/automation-rules', {
        name,
        trigger,
        triggerConfig: TIME_BASED_TRIGGERS.has(trigger) ? { days: Number(days) } : undefined,
        action,
        actionConfig: action === 'SEND_WHATSAPP' ? { messageTemplate } : { titleTemplate, assignToId },
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível criar a automação.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-6 grid grid-cols-1 gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 sm:grid-cols-2"
    >
      <input className="input sm:col-span-2" placeholder="Nome da automação*" value={name} onChange={(e) => setName(e.target.value)} required />

      <label className="text-sm text-slate-600 dark:text-slate-300">
        <span className="mb-1 block text-slate-400 dark:text-slate-500">Gatilho</span>
        <select className="input" value={trigger} onChange={(e) => setTrigger(e.target.value as AutomationTrigger)}>
          {(Object.keys(TRIGGER_LABEL) as AutomationTrigger[]).map((t) => (
            <option key={t} value={t}>
              {TRIGGER_LABEL[t]}
            </option>
          ))}
        </select>
      </label>

      {TIME_BASED_TRIGGERS.has(trigger) && (
        <label className="text-sm text-slate-600 dark:text-slate-300">
          <span className="mb-1 block text-slate-400 dark:text-slate-500">Dias</span>
          <input className="input" type="number" min={1} step={1} value={days} onChange={(e) => setDays(e.target.value)} required />
        </label>
      )}

      <label className="text-sm text-slate-600 dark:text-slate-300">
        <span className="mb-1 block text-slate-400 dark:text-slate-500">Ação</span>
        <select className="input" value={action} onChange={(e) => setAction(e.target.value as AutomationAction)}>
          {(Object.keys(ACTION_LABEL) as AutomationAction[]).map((a) => (
            <option key={a} value={a}>
              {ACTION_LABEL[a]}
            </option>
          ))}
        </select>
      </label>

      {action === 'SEND_WHATSAPP' && (
        <label className="text-sm text-slate-600 dark:text-slate-300 sm:col-span-2">
          <span className="mb-1 block text-slate-400 dark:text-slate-500">
            Mensagem — use <code>{'{{customerName}}'}</code> para o nome do cliente
          </span>
          <textarea
            className="input"
            rows={2}
            value={messageTemplate}
            onChange={(e) => setMessageTemplate(e.target.value)}
            required
          />
        </label>
      )}

      {action === 'CREATE_TASK' && (
        <>
          <label className="text-sm text-slate-600 dark:text-slate-300">
            <span className="mb-1 block text-slate-400 dark:text-slate-500">
              Título da tarefa — use <code>{'{{customerName}}'}</code>
            </span>
            <input className="input" value={titleTemplate} onChange={(e) => setTitleTemplate(e.target.value)} required />
          </label>
          <label className="text-sm text-slate-600 dark:text-slate-300">
            <span className="mb-1 block text-slate-400 dark:text-slate-500">Responsável</span>
            <select className="input" value={assignToId} onChange={(e) => setAssignToId(e.target.value)} required>
              <option value="">Selecione…</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
        </>
      )}

      {error && <p className="col-span-full text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="col-span-full">
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Salvando…' : 'Salvar automação'}
        </button>
      </div>
    </form>
  );
}
