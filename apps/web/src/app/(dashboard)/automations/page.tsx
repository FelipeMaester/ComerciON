'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '@/lib/api-client';
import { ErrorNotice } from '@/components/ErrorNotice';
import type {
  AppUser,
  AutomationCatalog,
  AutomationRule,
  AutomationRunLog,
  AutomationSuggestion,
  AutomationSuggestionsResponse,
  CatalogAction,
  CatalogField,
  CatalogTrigger,
} from '@/lib/types';

/**
 * Tela de Automações.
 *
 * Nada aqui sabe quais gatilhos ou ações existem: o catálogo vem do backend
 * (GET /automation-rules/catalog) e o formulário se desenha a partir dele.
 * Um gatilho novo no schema do Prisma aparece nesta tela sozinho, com rótulo,
 * descrição e campos, sem uma linha de código no frontend.
 */
export default function AutomationsPage() {
  const [catalog, setCatalog] = useState<AutomationCatalog | null>(null);
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [suggestions, setSuggestions] = useState<AutomationSuggestionsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AutomationRule | null>(null);
  const [expandedRuleId, setExpandedRuleId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [catalogData, ruleData, userData, suggestionData] = await Promise.all([
        api.get<AutomationCatalog>('/automation-rules/catalog'),
        api.get<AutomationRule[]>('/automation-rules'),
        api.get<AppUser[]>('/users'),
        api.get<AutomationSuggestionsResponse>('/automation-rules/suggestions'),
      ]);
      setCatalog(catalogData);
      setRules(ruleData);
      setUsers(userData);
      setSuggestions(suggestionData);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar as automações.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleActive(rule: AutomationRule) {
    await api.patch(`/automation-rules/${rule.id}`, { isActive: !rule.isActive });
    load();
  }

  async function remove(rule: AutomationRule) {
    const runs = rule.stats?.runCount ?? 0;
    const aviso =
      runs > 0
        ? `Excluir "${rule.name}"? O histórico de ${runs} execuç${runs === 1 ? 'ão' : 'ões'} vai junto. Se quiser só parar de disparar, use o botão Ativa/Inativa.`
        : `Excluir "${rule.name}"?`;
    if (!window.confirm(aviso)) return;
    await api.delete(`/automation-rules/${rule.id}`);
    load();
  }

  function startEdit(rule: AutomationRule) {
    setEditing(rule);
    setShowForm(true);
  }

  if (error) return <ErrorNotice message={error} compact={false} />;
  if (!catalog) return <p className="text-sm text-tenue">Carregando…</p>;

  const failing = rules.filter((r) => r.isActive && (r.stats?.failureCount ?? 0) > 0);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="titulo-pagina">Automações</h1>
        <button
          onClick={() => {
            setEditing(null);
            setShowForm((v) => !v);
          }}
          className="btn-primary"
        >
          {showForm ? 'Cancelar' : 'Nova automação'}
        </button>
      </div>

      {failing.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <strong>
            {failing.length} automação{failing.length === 1 ? '' : 'ões'} ativa{failing.length === 1 ? '' : 's'} com falhas.
          </strong>{' '}
          Abra &quot;Ver execuções&quot; para saber o motivo — geralmente é cliente sem telefone cadastrado.
        </div>
      )}

      {showForm && (
        <RuleForm
          catalog={catalog}
          users={users}
          editing={editing}
          onDone={() => {
            setShowForm(false);
            setEditing(null);
            load();
          }}
        />
      )}

      <SuggestionsPanel
        data={suggestions}
        catalog={catalog}
        onChanged={load}
        onError={(msg) => setError(msg)}
      />

      <h2 className="mb-2 mt-6 text-sm font-semibold text-suave">
        Automações ativas no sistema
      </h2>

      <ul className="space-y-2">
        {rules.map((rule) => (
          <RuleRow
            key={rule.id}
            rule={rule}
            catalog={catalog}
            expanded={expandedRuleId === rule.id}
            onToggleExpand={() => setExpandedRuleId((id) => (id === rule.id ? null : rule.id))}
            onToggleActive={() => toggleActive(rule)}
            onEdit={() => startEdit(rule)}
            onRemove={() => remove(rule)}
          />
        ))}
        {rules.length === 0 && (
          <p className="text-sm text-tenue">Nenhuma automação criada ainda.</p>
        )}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sugestões da IA                                                     */
/* ------------------------------------------------------------------ */

function SuggestionsPanel({
  data,
  catalog,
  onChanged,
  onError,
}: {
  data: AutomationSuggestionsResponse | null;
  catalog: AutomationCatalog;
  onChanged: () => void;
  onError: (msg: string) => void;
}) {
  const [analyzing, setAnalyzing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function analyze() {
    setAnalyzing(true);
    try {
      await api.post('/automation-rules/suggestions/refresh', {});
      onChanged();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Não foi possível analisar o negócio agora.');
    } finally {
      setAnalyzing(false);
    }
  }

  async function act(suggestion: AutomationSuggestion, action: 'accept' | 'dismiss') {
    setBusyId(suggestion.id);
    try {
      await api.post(`/automation-rules/suggestions/${suggestion.id}/${action}`, {});
      onChanged();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Não foi possível aplicar a sugestão.');
    } finally {
      setBusyId(null);
    }
  }

  const list = data?.suggestions ?? [];

  return (
    <section className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-4 dark:border-indigo-900 dark:bg-indigo-950/30">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-indigo-900 dark:text-indigo-200">
            O que o sistema identificou sozinho
          </h2>
          <p className="mt-0.5 text-xs text-indigo-700 dark:text-indigo-300">
            {data?.generatedAt
              ? `Última análise em ${new Date(data.generatedAt).toLocaleString('pt-BR')}.`
              : 'O sistema ainda não analisou o seu negócio.'}
          </p>
        </div>
        <button onClick={analyze} disabled={analyzing} className="btn-primary shrink-0 text-xs">
          {analyzing ? 'Analisando…' : data?.generatedAt ? 'Analisar de novo' : 'Analisar meu negócio'}
        </button>
      </div>

      {data?.skipped && (
        <p className="mt-3 text-sm text-indigo-800 dark:text-indigo-300">
          Não há movimento suficiente para sugerir automações ainda — sem orçamentos parados, contas vencidas ou
          clientes inativos, não há o que automatizar.
        </p>
      )}

      {!data?.skipped && list.length === 0 && (
        <p className="mt-3 text-sm text-indigo-800 dark:text-indigo-300">
          {data?.generatedAt
            ? 'Nenhuma sugestão nova: o que fazia sentido automatizar já está coberto pelas suas regras atuais.'
            : 'Clique em "Analisar meu negócio" e a IA vai olhar seus orçamentos, contas a receber, estoque e clientes para propor automações prontas.'}
        </p>
      )}

      {list.length > 0 && (
        <ul className="mt-3 space-y-2">
          {list.map((s) => (
            <li
              key={s.id}
              className="rounded-lg card border-marca/30 p-3"
            >
              <p className="text-sm font-medium text-texto">{s.name}</p>
              <p className="mt-0.5 text-xs text-suave">
                {describeRule(s, catalog)}
              </p>
              <p className="mt-1.5 text-sm text-indigo-800 dark:text-indigo-300">{s.rationale}</p>
              <SuggestionPreview suggestion={s} />
              <div className="mt-2 flex gap-2">
                <button onClick={() => act(s, 'accept')} disabled={busyId === s.id} className="btn-primary text-xs">
                  Ativar
                </button>
                <button
                  onClick={() => act(s, 'dismiss')}
                  disabled={busyId === s.id}
                  className="rounded-md border border-linha px-2.5 py-1 text-xs text-suave hover:bg-realce"
                >
                  Não quero
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Mostra o texto exato que sairia — o usuário precisa ver isso antes de ativar. */
function SuggestionPreview({ suggestion }: { suggestion: AutomationSuggestion }) {
  const message = suggestion.actionConfig.messageTemplate;
  const title = suggestion.actionConfig.titleTemplate;
  const preview = message ?? title;
  if (!preview) return null;

  return (
    <p className="mt-1.5 rounded border-l-2 border-linha bg-realce py-1 pl-2 text-xs italic text-suave">
      {message ? 'Mensagem: ' : 'Tarefa: '}
      {preview}
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* Lista de regras                                                     */
/* ------------------------------------------------------------------ */

function RuleRow({
  rule,
  catalog,
  expanded,
  onToggleExpand,
  onToggleActive,
  onEdit,
  onRemove,
}: {
  rule: AutomationRule;
  catalog: AutomationCatalog;
  expanded: boolean;
  onToggleExpand: () => void;
  onToggleActive: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const stats = rule.stats;
  const failing = (stats?.failureCount ?? 0) > 0;

  return (
    <li className="card p-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-texto">{rule.name}</p>
          <p className="text-xs text-suave">{describeRule(rule, catalog)}</p>
          {stats && (
            <p className="mt-1 text-xs text-tenue">
              {stats.runCount === 0
                ? 'Nunca disparou'
                : `${stats.runCount} disparo${stats.runCount === 1 ? '' : 's'} · última vez em ${new Date(
                    stats.lastFiredAt as string,
                  ).toLocaleString('pt-BR')}`}
              {failing && (
                <span className="ml-1 text-red-600 dark:text-red-400">
                  · {stats.failureCount} falha{stats.failureCount === 1 ? '' : 's'}
                </span>
              )}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={onToggleExpand}
            className="text-xs text-suave hover:text-texto"
          >
            {expanded ? 'Ocultar' : 'Execuções'}
          </button>
          <button
            onClick={onEdit}
            className="text-xs text-suave hover:text-texto"
          >
            Editar
          </button>
          <button onClick={onRemove} className="text-xs text-red-600 hover:underline dark:text-red-400">
            Excluir
          </button>
          <button
            onClick={onToggleActive}
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              rule.isActive
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                : 'bg-realce text-suave'
            }`}
          >
            {rule.isActive ? 'Ativa' : 'Inativa'}
          </button>
        </div>
      </div>
      {expanded && <RuleRuns ruleId={rule.id} />}
    </li>
  );
}

/**
 * Frase legível da regra, montada com os rótulos do catálogo. Se o backend
 * mandar um gatilho que esta versão da tela não conhece, cai no próprio código
 * do gatilho em vez de renderizar "undefined" — que era o comportamento antigo.
 */
function describeRule(
  rule: Pick<AutomationRule, 'trigger' | 'triggerConfig' | 'action'> & { cooldownDays?: number | null },
  catalog: AutomationCatalog,
): string {
  const trigger = catalog.triggers.find((t) => t.value === rule.trigger);
  const action = catalog.actions.find((a) => a.value === rule.action);

  const days = rule.triggerConfig?.days;
  const triggerText = `${trigger?.label ?? rule.trigger}${days ? ` (${days} dias)` : ''}`;
  const cooldown = rule.cooldownDays ? ` · repete a cada ${rule.cooldownDays} dias` : '';

  return `${triggerText} → ${action?.label ?? rule.action}${cooldown}`;
}

function RuleRuns({ ruleId }: { ruleId: string }) {
  const [runs, setRuns] = useState<AutomationRunLog[] | null>(null);

  useEffect(() => {
    api
      .get<AutomationRunLog[]>(`/automation-rules/${ruleId}/runs`)
      .then(setRuns)
      .catch(() => setRuns([]));
  }, [ruleId]);

  if (!runs) return <p className="mt-2 text-xs text-tenue">Carregando execuções…</p>;
  if (runs.length === 0)
    return <p className="mt-2 text-xs text-tenue">Essa regra ainda não disparou nenhuma vez.</p>;

  return (
    <ul className="mt-2 space-y-1 border-t border-linha pt-2">
      {runs.map((run) => (
        <li key={run.id} className="text-xs text-suave">
          {new Date(run.firedAt).toLocaleString('pt-BR')} — {run.entityType} —{' '}
          {run.success ? (
            <span className="text-emerald-600 dark:text-emerald-400">sucesso</span>
          ) : (
            <span className="text-red-600 dark:text-red-400">falhou: {run.error}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Formulário gerado a partir do catálogo                              */
/* ------------------------------------------------------------------ */

function RuleForm({
  catalog,
  users,
  editing,
  onDone,
}: {
  catalog: AutomationCatalog;
  users: AppUser[];
  editing: AutomationRule | null;
  onDone: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? '');
  const [triggerValue, setTriggerValue] = useState(editing?.trigger ?? catalog.triggers[0].value);
  const [actionValue, setActionValue] = useState(editing?.action ?? catalog.actions[0].value);
  const [cooldownDays, setCooldownDays] = useState(editing?.cooldownDays ? String(editing.cooldownDays) : '');
  const [values, setValues] = useState<Record<string, string>>(() => ({
    ...Object.fromEntries(Object.entries(editing?.triggerConfig ?? {}).map(([k, v]) => [k, String(v)])),
    ...Object.fromEntries(Object.entries(editing?.actionConfig ?? {}).map(([k, v]) => [k, String(v ?? '')])),
  }));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const trigger = catalog.triggers.find((t) => t.value === triggerValue) as CatalogTrigger;
  const action = catalog.actions.find((a) => a.value === actionValue) as CatalogAction;

  // A mesma checagem que o backend faz — mostrada antes de o usuário salvar,
  // em vez de deixá-lo escrever a mensagem inteira e só então tomar o erro.
  const combinacaoInvalida = action.contactsCustomer && !trigger.hasCustomer;

  // Preenche os valores padrão dos campos do gatilho/ação escolhidos.
  useEffect(() => {
    setValues((current) => {
      const next = { ...current };
      for (const field of [...trigger.fields, ...action.fields]) {
        if (next[field.key] === undefined && field.defaultValue !== undefined) {
          next[field.key] = String(field.defaultValue);
        }
      }
      return next;
    });
  }, [trigger, action]);

  const setValue = (key: string, value: string) => setValues((v) => ({ ...v, [key]: value }));

  const triggerConfig = useMemo(() => {
    if (trigger.fields.length === 0) return undefined;
    return Object.fromEntries(trigger.fields.map((f) => [f.key, f.type === 'number' ? Number(values[f.key]) : values[f.key]]));
  }, [trigger, values]);

  const actionConfig = useMemo(
    () => Object.fromEntries(action.fields.map((f) => [f.key, values[f.key] ?? ''])),
    [action, values],
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body = {
        name,
        trigger: triggerValue,
        triggerConfig,
        action: actionValue,
        actionConfig,
        cooldownDays: cooldownDays ? Number(cooldownDays) : undefined,
      };
      if (editing) await api.patch(`/automation-rules/${editing.id}`, body);
      else await api.post('/automation-rules', body);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar a automação.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="card mb-6 grid grid-cols-1 gap-3 p-4 sm:grid-cols-2"
    >
      <input
        className="input sm:col-span-2"
        placeholder="Nome da automação*"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />

      <label className="text-sm text-suave">
        <span className="mb-1 block text-tenue">Quando isto acontecer</span>
        <select
          className="input"
          value={triggerValue}
          onChange={(e) => setTriggerValue(e.target.value as typeof triggerValue)}
        >
          {catalog.triggers.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-tenue">{trigger.description}</span>
      </label>

      <label className="text-sm text-suave">
        <span className="mb-1 block text-tenue">Faça isto</span>
        <select
          className="input"
          value={actionValue}
          onChange={(e) => setActionValue(e.target.value as typeof actionValue)}
        >
          {catalog.actions.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-tenue">{action.description}</span>
      </label>

      {trigger.fields.map((field) => (
        <DynamicField key={field.key} field={field} value={values[field.key] ?? ''} onChange={setValue} users={users} />
      ))}

      {combinacaoInvalida ? (
        <p className="col-span-full rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          &quot;{trigger.label}&quot; não tem um cliente associado — não há para quem enviar. Escolha &quot;Criar
          tarefa&quot; para avisar a equipe.
        </p>
      ) : (
        action.fields.map((field) => (
          <DynamicField
            key={field.key}
            field={field}
            value={values[field.key] ?? ''}
            onChange={setValue}
            users={users}
            wide={field.type === 'textarea'}
          />
        ))
      )}

      {trigger.kind === 'scheduled' && (
        <label className="text-sm text-suave">
          <span className="mb-1 block text-tenue">Repetir a cada (dias)</span>
          <input
            className="input"
            type="number"
            min={1}
            placeholder="Não repetir"
            value={cooldownDays}
            onChange={(e) => setCooldownDays(e.target.value)}
          />
          <span className="mt-1 block text-xs text-tenue">
            Em branco: dispara uma única vez por registro. Preenchido: pode cobrar o mesmo registro de novo depois
            desse prazo.
          </span>
        </label>
      )}

      {action.contactsCustomer && !combinacaoInvalida && (
        <p className="col-span-full text-xs text-suave">
          Cada mensagem enviada é cobrada pelo WhatsApp. Comece com um prazo folgado e acompanhe o número de disparos
          antes de apertar.
        </p>
      )}

      {error && <p className="col-span-full text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="col-span-full">
        <button type="submit" disabled={saving || combinacaoInvalida} className="btn-primary">
          {saving ? 'Salvando…' : editing ? 'Salvar alterações' : 'Salvar automação'}
        </button>
      </div>
    </form>
  );
}

/** Renderiza um campo do catálogo — o frontend não sabe o que ele significa. */
function DynamicField({
  field,
  value,
  onChange,
  users,
  wide,
}: {
  field: CatalogField;
  value: string;
  onChange: (key: string, value: string) => void;
  users: AppUser[];
  wide?: boolean;
}) {
  return (
    <label className={`text-sm text-suave ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="mb-1 block text-tenue">{field.label}</span>

      {field.type === 'textarea' && (
        <textarea
          className="input"
          rows={2}
          value={value}
          onChange={(e) => onChange(field.key, e.target.value)}
          required={field.required}
        />
      )}

      {field.type === 'user' && (
        <select
          className="input"
          value={value}
          onChange={(e) => onChange(field.key, e.target.value)}
          required={field.required}
        >
          <option value="">Selecione…</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      )}

      {(field.type === 'number' || field.type === 'text') && (
        <input
          className="input"
          type={field.type}
          min={field.min}
          step={field.type === 'number' ? 1 : undefined}
          value={value}
          onChange={(e) => onChange(field.key, e.target.value)}
          required={field.required}
        />
      )}

      {field.help && <span className="mt-1 block text-xs text-tenue">{field.help}</span>}
    </label>
  );
}
