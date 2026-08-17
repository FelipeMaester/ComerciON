'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api-client';
import { ErrorNotice } from '@/components/ErrorNotice';
import type { Task } from '@/lib/types';

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function groupTasks(tasks: Task[]) {
  const today = startOfDay(new Date());
  const in7Days = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

  const groups = { overdue: [] as Task[], today: [] as Task[], upcoming: [] as Task[], other: [] as Task[], done: [] as Task[] };

  for (const task of tasks) {
    if (task.status === 'DONE') {
      groups.done.push(task);
      continue;
    }
    if (!task.dueDate) {
      groups.other.push(task);
      continue;
    }
    const due = startOfDay(new Date(task.dueDate));
    if (due < today) groups.overdue.push(task);
    else if (due.getTime() === today.getTime()) groups.today.push(task);
    else if (due < in7Days) groups.upcoming.push(task);
    else groups.other.push(task);
  }
  return groups;
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function load() {
    try {
      const data = await api.get<Task[]>('/tasks');
      setTasks(data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar as tarefas.');
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleDone(task: Task) {
    await api.patch(`/tasks/${task.id}/${task.status === 'DONE' ? 'reopen' : 'complete'}`);
    load();
  }

  if (error) return <ErrorNotice message={error} compact={false} />;

  const groups = groupTasks(tasks);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="titulo-pagina">Tarefas</h1>
        <button onClick={() => setShowForm((v) => !v)} className="btn-primary">
          {showForm ? 'Cancelar' : 'Nova tarefa'}
        </button>
      </div>

      {showForm && (
        <CreateTaskForm
          onCreated={() => {
            setShowForm(false);
            load();
          }}
        />
      )}

      <TaskSection title="Atrasadas" tasks={groups.overdue} tone="red" onToggle={toggleDone} />
      <TaskSection title="Hoje" tasks={groups.today} tone="amber" onToggle={toggleDone} />
      <TaskSection title="Próximos 7 dias" tasks={groups.upcoming} tone="slate" onToggle={toggleDone} />
      <TaskSection title="Sem prazo / mais distantes" tasks={groups.other} tone="slate" onToggle={toggleDone} />
      <TaskSection title="Concluídas" tasks={groups.done} tone="slate" onToggle={toggleDone} defaultCollapsed />

      {tasks.length === 0 && (
        <p className="text-sm text-tenue">Nenhuma tarefa ainda — crie a primeira acima.</p>
      )}
    </div>
  );
}

const TONE_CLASSES: Record<string, string> = {
  red: 'text-red-600 dark:text-red-400',
  amber: 'text-amber-600 dark:text-amber-400',
  slate: 'text-suave',
};

function TaskSection({
  title,
  tasks,
  tone,
  onToggle,
  defaultCollapsed,
}: {
  title: string;
  tasks: Task[];
  tone: string;
  onToggle: (task: Task) => void;
  defaultCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(Boolean(defaultCollapsed));
  if (tasks.length === 0) return null;

  return (
    <div className="mb-6">
      <button
        onClick={() => setCollapsed((v) => !v)}
        className={`mb-2 flex items-center gap-2 text-sm font-medium ${TONE_CLASSES[tone]}`}
      >
        {collapsed ? '▸' : '▾'} {title} ({tasks.length})
      </button>
      {!collapsed && (
        <ul className="space-y-2">
          {tasks.map((task) => (
            <li key={task.id} className="card p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <span className={task.status === 'DONE' ? 'text-tenue line-through' : 'text-texto'}>
                    {task.title}
                  </span>
                  {task.dueDate && (
                    <span className="ml-2 text-xs text-tenue">
                      vence {new Date(task.dueDate).toLocaleDateString('pt-BR')}
                    </span>
                  )}
                  {task.customer && (
                    <Link href={`/customers/${task.customer.id}`} className="ml-2 text-xs text-suave hover:underline">
                      {task.customer.name}
                    </Link>
                  )}
                  {task.assignedTo && (
                    <span className="ml-2 text-xs text-tenue">— {task.assignedTo.name}</span>
                  )}
                </div>
                <button
                  onClick={() => onToggle(task)}
                  className="shrink-0 text-xs text-suave hover:text-texto"
                >
                  {task.status === 'DONE' ? 'Reabrir' : 'Concluir'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CreateTaskForm({ onCreated }: { onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post('/tasks', {
        title,
        description: description || undefined,
        dueDate: dueDate || undefined,
      });
      setTitle('');
      setDescription('');
      setDueDate('');
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível criar a tarefa.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="card mb-6 grid grid-cols-1 gap-3 p-4 sm:grid-cols-3"
    >
      <input className="input sm:col-span-2" placeholder="Título*" value={title} onChange={(e) => setTitle(e.target.value)} required />
      <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      <input
        className="input sm:col-span-3"
        placeholder="Descrição (opcional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      {error && <p className="col-span-full text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="col-span-full">
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Salvando…' : 'Salvar tarefa'}
        </button>
      </div>
    </form>
  );
}
