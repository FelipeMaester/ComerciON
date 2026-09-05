'use client';

import { FormEvent, Fragment, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api-client';
import { CarregandoLista } from '@/components/Carregando';
import type { AppUser, UserRole } from '@/lib/types';
import { papel } from '@/lib/format';
import { carregarPerfil } from '@/lib/loja';

const ROLES: UserRole[] = ['ADMIN', 'SALES', 'FINANCE', 'INVENTORY', 'SUPPORT'];

export default function UsersPage() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  // Quem está logado: na própria linha o caminho certo é Preferências, que
  // pede a senha atual. A API recusa de qualquer forma; esconder aqui evita
  // oferecer um botão que só existe para dar erro.
  const [meuId, setMeuId] = useState<string | null>(null);
  const [trocandoSenhaDe, setTrocandoSenhaDe] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<AppUser[]>('/users');
      setUsers(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar os usuários.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // Falha em silêncio de propósito: sem saber quem sou, a tela mostra o
    // botão a mais — e a API recusa. É melhor que esconder a coluna inteira.
    carregarPerfil()
      .then((perfil) => setMeuId(perfil.id))
      .catch(() => {});
  }, []);

  async function toggleActive(user: AppUser) {
    const action = user.isActive ? 'deactivate' : 'activate';
    await api.patch(`/users/${user.id}/${action}`);
    load();
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="titulo-pagina">Usuários</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="btn-primary"
        >
          {showForm ? 'Cancelar' : 'Novo usuário'}
        </button>
      </div>

      {showForm && (
        <CreateUserForm
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
                <th>E-mail</th>
                <th>Papel</th>
                <th>Situação</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <Fragment key={user.id}>
                  <tr>
                    <td>{user.name}</td>
                    <td>{user.email}</td>
                    <td>{papel(user.role)}</td>
                    <td>
                      <span className={user.isActive ? 'text-emerald-700 dark:text-emerald-400' : 'text-tenue'}>
                        {user.isActive ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap text-right">
                      {podeDefinirSenha(user, meuId) && (
                        <button
                          onClick={() => setTrocandoSenhaDe((atual) => (atual === user.id ? null : user.id))}
                          className="acao-em-celula mr-4 text-suave hover:text-texto"
                        >
                          {trocandoSenhaDe === user.id ? 'Cancelar' : 'Definir senha'}
                        </button>
                      )}
                      <button onClick={() => toggleActive(user)} className="acao-em-celula text-suave hover:text-texto">
                        {user.isActive ? 'Desativar' : 'Ativar'}
                      </button>
                    </td>
                  </tr>
                  {trocandoSenhaDe === user.id && (
                    <tr>
                      <td colSpan={5} className="bg-fundo">
                        <FormularioDeSenha usuario={user} aoTerminar={() => setTrocandoSenhaDe(null)} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-tenue">
                    Nenhum usuário cadastrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CreateUserForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('SALES');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post('/users', { name, email, password, role });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível criar o usuário.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card mb-6 grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
      <input className="input" placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} required />
      <input
        className="input"
        type="email"
        placeholder="E-mail"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <input
        className="input"
        type="password"
        placeholder="Senha provisória"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      <select className="input" value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {papel(r)}
          </option>
        ))}
      </select>

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

/**
 * Quem pode ter a senha definida pelo administrador.
 *
 * O super-administrador opera a plataforma, não a loja — e a própria conta se
 * troca em Preferências, onde o sistema pede a senha atual. Nos dois casos a
 * API recusa; esconder o botão evita oferecer o que só dá erro.
 */
function podeDefinirSenha(usuario: AppUser, meuId: string | null): boolean {
  return usuario.role !== 'SUPER_ADMIN' && usuario.id !== meuId;
}

/**
 * Define uma senha nova para outra pessoa da equipe.
 *
 * A saída para quando o e-mail de "esqueci minha senha" não chega: provedor de
 * e-mail sem configurar, endereço errado no cadastro, mensagem no spam. Sem
 * isto a pessoa fica trancada para fora e só o banco de dados resolve.
 */
function FormularioDeSenha({ usuario, aoTerminar }: { usuario: AppUser; aoTerminar: () => void }) {
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [pronto, setPronto] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      await api.post(`/users/${usuario.id}/senha`, { novaSenha: senha });
      setPronto(true);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível definir a senha.');
    } finally {
      setSalvando(false);
    }
  }

  if (pronto) {
    return (
      <div className="p-4 text-sm">
        <p className="mb-2 text-emerald-700 dark:text-emerald-400">
          Senha definida para {usuario.name}.
        </p>
        {/* Duas consequências que a pessoa precisa saber ANTES de fechar: quem
            estava logado nessa conta caiu, e a senha combinada aqui é
            provisória por natureza — quem a digitou também a conhece. */}
        <p className="mb-3 text-suave">
          As sessões abertas dessa conta foram encerradas. Passe a senha para {usuario.name} por um
          canal em que vocês confiem e peça que ela troque em Preferências.
        </p>
        <button type="button" onClick={aoTerminar} className="btn-secondary">
          Fechar
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-start gap-3 p-4">
      <div>
        <label className="mb-1 block text-sm text-suave" htmlFor={`senha-${usuario.id}`}>
          Nova senha de {usuario.name}
        </label>
        <input
          id={`senha-${usuario.id}`}
          className="input"
          type="password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          autoComplete="new-password"
          required
        />
        <p className="mt-1 text-xs text-tenue">
          Mínimo 8 caracteres, com maiúscula, minúscula e número.
        </p>
      </div>
      <button type="submit" disabled={salvando} className="btn-primary mt-6">
        {salvando ? 'Salvando…' : 'Salvar senha'}
      </button>
      {erro && <p className="w-full text-sm text-red-600 dark:text-red-400">{erro}</p>}
    </form>
  );
}
