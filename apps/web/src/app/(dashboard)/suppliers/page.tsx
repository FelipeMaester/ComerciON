'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api-client';
import { CarregandoLista } from '@/components/Carregando';
import { BuscaSemResultado, ListaVazia } from '@/components/ListaVazia';
import type { Supplier } from '@/lib/types';

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<Supplier[]>('/suppliers');
      setSuppliers(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar os fornecedores.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="titulo-pagina">Fornecedores</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="btn-primary"
        >
          {showForm ? 'Cancelar' : 'Novo fornecedor'}
        </button>
      </div>

      {showForm && (
        <CreateSupplierForm
          onCreated={() => {
            setShowForm(false);
            load();
          }}
        />
      )}

      {error && <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {loading ? (
        <CarregandoLista />
      ) : (
        <div className="w-full overflow-x-auto">
          <table className="tabela card">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Documento</th>
                <th>E-mail</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id}>
                  <td>
                    <Link href={`/suppliers/${s.id}`} className="text-texto hover:underline">
                      {s.name}
                    </Link>
                  </td>
                  <td>{s.document ?? '—'}</td>
                  <td>{s.email ?? '—'}</td>
                  <td>
                    <span className={s.isActive ? 'text-emerald-700 dark:text-emerald-400' : 'text-tenue'}>
                      {s.isActive ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                </tr>
              ))}
              {suppliers.length === 0 && (
                <ListaVazia
                  icone="fornecedor"
                  titulo="Nenhum fornecedor cadastrado."
                  descricao="Cadastre para vincular às peças e saber de quem comprar quando o estoque baixar."
                  colunas={4}
                />
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CreateSupplierForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('');
  const [document, setDocument] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post('/suppliers', {
        name,
        document: document || undefined,
        email: email || undefined,
        phone: phone || undefined,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível criar o fornecedor.');
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
        placeholder="Nome"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <input
        className="input"
        placeholder="CPF ou CNPJ (opcional)"
        value={document}
        onChange={(e) => setDocument(e.target.value)}
      />
      <input
        className="input"
        type="email"
        placeholder="E-mail (opcional)"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        className="input"
        placeholder="Telefone (opcional)"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />

      {error && <p className="col-span-full text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="col-span-full">
        <button
          type="submit"
          disabled={saving}
          className="btn-primary"
        >
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </form>
  );
}
