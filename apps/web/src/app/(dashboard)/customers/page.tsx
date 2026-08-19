'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api-client';
import { CarregandoLista } from '@/components/Carregando';
import { AcoesDaLinha } from '@/components/AcoesDaLinha';
import { useAviso } from '@/components/Avisos';
import { BotaoCsv } from '@/components/BotaoCsv';
import { AvisoDeOrdenacaoPorPagina, CabecalhoOrdenavel, SeletorDeColunas } from '@/components/Tabela';
import { buscarTodasAsPaginas, useTabela, type Coluna } from '@/lib/tabela';
import { BuscaSemResultado, ListaVazia } from '@/components/ListaVazia';
import { Pagination } from '@/components/Pagination';
import { segmentoDoCliente } from '@/lib/format';
import type { AddressType, Customer, CustomerType, Paginated } from '@/lib/types';

interface VehicleDraft {
  plate: string;
  brand: string;
  model: string;
  color: string;
  year: string;
}

const EMPTY_VEHICLE_DRAFT: VehicleDraft = { plate: '', brand: '', model: '', color: '', year: '' };

function describeVehicle(vehicle: VehicleDraft): string {
  return [vehicle.plate, vehicle.brand, vehicle.model, vehicle.year, vehicle.color].filter(Boolean).join(' · ');
}

/** Nome é fixo: é o que identifica a linha. */
const COLUNAS: Coluna<Customer>[] = [
  { chave: 'nome', titulo: 'Nome', fixa: true, valor: (c) => c.name },
  { chave: 'tipo', titulo: 'Tipo', valor: (c) => (c.type === 'INDIVIDUAL' ? 'Pessoa física' : 'Pessoa jurídica') },
  { chave: 'documento', titulo: 'Documento', valor: (c) => c.document },
  { chave: 'segmento', titulo: 'Segmento', valor: (c) => c.segment },
  { chave: 'status', titulo: 'Status', valor: (c) => (c.isActive ? 'Ativo' : 'Inativo') },
];

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [pageInfo, setPageInfo] = useState<Paginated<Customer> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const tabela = useTabela<Customer>('clientes', COLUNAS, customers);
  const mostrar = (chave: string) => tabela.visiveis.some((c) => c.chave === chave);
  const avisar = useAviso();

  async function copiarTelefone(cliente: Customer) {
    if (!cliente.phone) return;
    try {
      await navigator.clipboard.writeText(cliente.phone);
      avisar(`Telefone de ${cliente.name} copiado.`);
    } catch {
      // Área de transferência bloqueada (acontece fora de HTTPS): melhor dizer
      // do que fingir que copiou.
      setError('Não foi possível copiar — o navegador bloqueou a área de transferência.');
    }
  }

  async function alternarAtivo(cliente: Customer) {
    const acao = cliente.isActive ? 'deactivate' : 'activate';
    try {
      await api.patch(`/customers/${cliente.id}/${acao}`);
      avisar(cliente.isActive ? `${cliente.name} foi desativado.` : `${cliente.name} voltou para a lista.`);
      load(search, pageInfo?.page ?? 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível mudar a situação do cliente.');
    }
  }

  async function load(searchTerm?: string, page = 1) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (searchTerm) params.set('search', searchTerm);
      const data = await api.get<Paginated<Customer>>(`/customers?${params}`);
      setCustomers(data.items);
      setPageInfo(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar os clientes.');
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
        <h1 className="titulo-pagina">Clientes</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="btn-primary"
        >
          {showForm ? 'Cancelar' : 'Novo cliente'}
        </button>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          load(search);
        }}
        className="mb-4 flex gap-2"
      >
        <input
          className="input max-w-xs"
          placeholder="Buscar por nome..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="submit" className="btn-secondary">
          Buscar
        </button>
        <div className="ml-auto flex items-center gap-2">
          <BotaoCsv
            nomeBase="clientes"
            colunas={tabela.visiveis}
            itens={tabela.ordenados}
            total={pageInfo?.total}
            ordenar={tabela.ordenarLista}
            carregarTudo={() =>
              buscarTodasAsPaginas<Customer>(async (pagina, tamanho) => {
                const params = new URLSearchParams({ page: String(pagina), pageSize: String(tamanho) });
                if (search) params.set('search', search);
                return api.get<Paginated<Customer>>(`/customers?${params}`);
              })
            }
          />
          <SeletorDeColunas
            colunas={COLUNAS}
            escondidas={tabela.escondidas}
            aoAlternar={tabela.alternarColuna}
            aoRestaurar={tabela.restaurar}
          />
        </div>
      </form>

      {showForm && (
        <CreateCustomerForm
          onCreated={() => {
            setShowForm(false);
            load(search);
          }}
        />
      )}

      {error && <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <AvisoDeOrdenacaoPorPagina
        ordenando={Boolean(tabela.ordenacao)}
        naTela={tabela.ordenados.length}
        total={pageInfo?.total}
      />

      {loading ? (
        <CarregandoLista />
      ) : (
        <div className="w-full overflow-x-auto">
          <table className="tabela card">
            <thead>
              <tr>
                {tabela.visiveis.map((coluna) => (
                  <CabecalhoOrdenavel
                    key={coluna.chave}
                    coluna={coluna}
                    ordenacao={tabela.ordenacao}
                    aoOrdenar={tabela.alternarOrdem}
                  />
                ))}
                <th className="w-px" />
              </tr>
            </thead>
            <tbody>
              {tabela.ordenados.map((c) => (
                <tr key={c.id}>
                  {mostrar('nome') && (
                    <td>
                      <Link href={`/customers/${c.id}`} className="text-texto hover:underline">
                        {c.name}
                      </Link>
                    </td>
                  )}
                  {mostrar('tipo') && <td>{c.type === 'INDIVIDUAL' ? 'Pessoa física' : 'Pessoa jurídica'}</td>}
                  {mostrar('documento') && <td>{c.document ?? '—'}</td>}
                  {mostrar('segmento') && (
                    <td><span className={`badge ${c.segment === 'DELINQUENT' ? 'badge-erro' : c.segment === 'VIP' ? 'badge-marca' : 'badge-neutro'}`}>{segmentoDoCliente(c.segment)}</span></td>
                  )}
                  {mostrar('status') && (
                    <td>
                      <span className={`badge ${c.isActive ? 'badge-ok' : 'badge-neutro'}`}>
                        {c.isActive ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                  )}
                  <td className="w-px pr-2">
                    <AcoesDaLinha
                      rotulo={`Ações de ${c.name}`}
                      acoes={[
                        { rotulo: 'Abrir ficha', href: `/customers/${c.id}` },
                        // O PDV já abre com o cliente escolhido: quem atende um
                        // cliente conhecido não precisa procurá-lo de novo lá.
                        { rotulo: 'Nova venda', href: `/pos?cliente=${c.id}` },
                        { rotulo: 'Copiar telefone', oculta: !c.phone, aoClicar: () => copiarTelefone(c) },
                        {
                          rotulo: c.isActive ? 'Desativar cliente' : 'Reativar cliente',
                          perigo: c.isActive,
                          aoClicar: () => alternarAtivo(c),
                        },
                      ]}
                    />
                  </td>
                </tr>
              ))}
              {customers.length === 0 && (
                <ListaVazia
                  icone="cliente"
                  titulo="Nenhum cliente cadastrado ainda."
                  descricao="O cadastro guarda telefone, veículos e o histórico de compras de quem volta."
                  colunas={tabela.visiveis.length + 1}
                />
              )}
            </tbody>
          </table>
        </div>
      )}

      <Pagination data={pageInfo} onPageChange={(p) => load(search, p)} itemLabel="clientes" />
    </div>
  );
}

function CreateCustomerForm({ onCreated }: { onCreated: () => void }) {
  const [type, setType] = useState<CustomerType>('INDIVIDUAL');
  const [name, setName] = useState('');
  const [document, setDocument] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [showAddress, setShowAddress] = useState(false);
  const [addressType, setAddressType] = useState<AddressType>('SHIPPING');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');

  const [showVehicles, setShowVehicles] = useState(false);
  const [vehicleDraft, setVehicleDraft] = useState<VehicleDraft>(EMPTY_VEHICLE_DRAFT);
  const [vehicles, setVehicles] = useState<VehicleDraft[]>([]);

  function addVehicleDraft() {
    const plate = vehicleDraft.plate.trim().toUpperCase();
    if (!plate) return;
    setVehicles((prev) => [...prev, { ...vehicleDraft, plate }]);
    setVehicleDraft(EMPTY_VEHICLE_DRAFT);
  }

  function removeVehicleDraft(index: number) {
    setVehicles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const customer = await api.post<Customer>('/customers', {
        type,
        name,
        document: document || undefined,
        email: email || undefined,
        phone: phone || undefined,
      });

      if (showAddress) {
        try {
          await api.post(`/customers/${customer.id}/addresses`, {
            type: addressType,
            street,
            number: number || undefined,
            city,
            state,
            zipCode,
            isDefault: true,
          });
        } catch (err) {
          // Cliente já foi criado com sucesso — um endereço que falhou não
          // deve escondê-lo nem forçar o usuário a preencher tudo de novo,
          // só avisamos que ele precisa adicionar o endereço manualmente depois.
          setError(
            `Cliente criado, mas não foi possível salvar o endereço: ${
              err instanceof ApiError ? err.message : 'erro desconhecido'
            }`,
          );
          onCreated();
          return;
        }
      }

      if (vehicles.length > 0) {
        const failedPlates: string[] = [];
        for (const vehicle of vehicles) {
          try {
            // eslint-disable-next-line no-await-in-loop
            await api.post(`/customers/${customer.id}/vehicles`, {
              plate: vehicle.plate,
              brand: vehicle.brand || undefined,
              model: vehicle.model || undefined,
              color: vehicle.color || undefined,
              year: vehicle.year ? Number(vehicle.year) : undefined,
            });
          } catch {
            failedPlates.push(vehicle.plate);
          }
        }
        if (failedPlates.length > 0) {
          setError(`Cliente criado, mas não foi possível salvar a(s) placa(s): ${failedPlates.join(', ')}`);
          onCreated();
          return;
        }
      }

      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível criar o cliente.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="card mb-6 grid grid-cols-1 gap-3 p-4 sm:grid-cols-2"
    >
      <select className="input" value={type} onChange={(e) => setType(e.target.value as CustomerType)}>
        <option value="INDIVIDUAL">Pessoa física</option>
        <option value="COMPANY">Pessoa jurídica</option>
      </select>
      <input className="input" placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} required />
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

      <div className="col-span-full border-t border-linha pt-3">
        <button
          type="button"
          onClick={() => setShowAddress((v) => !v)}
          className="text-sm text-suave underline hover:text-texto"
        >
          {showAddress ? '− Não adicionar endereço' : '+ Adicionar endereço'}
        </button>
      </div>

      {showAddress && (
        <>
          <select className="input" value={addressType} onChange={(e) => setAddressType(e.target.value as AddressType)}>
            <option value="SHIPPING">Entrega</option>
            <option value="BILLING">Cobrança</option>
          </select>
          <input
            className="input"
            placeholder="Rua"
            value={street}
            onChange={(e) => setStreet(e.target.value)}
            required={showAddress}
          />
          <input className="input" placeholder="Número (opcional)" value={number} onChange={(e) => setNumber(e.target.value)} />
          <input
            className="input"
            placeholder="Cidade"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            required={showAddress}
          />
          <input
            className="input"
            placeholder="UF"
            maxLength={2}
            value={state}
            onChange={(e) => setState(e.target.value.toUpperCase())}
            required={showAddress}
          />
          <input
            className="input"
            placeholder="CEP"
            value={zipCode}
            onChange={(e) => setZipCode(e.target.value)}
            required={showAddress}
          />
        </>
      )}

      <div className="col-span-full border-t border-linha pt-3">
        <button
          type="button"
          onClick={() => setShowVehicles((v) => !v)}
          className="text-sm text-suave underline hover:text-texto"
        >
          {showVehicles ? '− Não adicionar veículo' : '+ Adicionar veículo'}
        </button>
      </div>

      {showVehicles && (
        <div className="card col-span-full space-y-2 p-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <input
              className="input"
              placeholder="Placa*"
              value={vehicleDraft.plate}
              onChange={(e) => setVehicleDraft((v) => ({ ...v, plate: e.target.value }))}
            />
            <input
              className="input"
              placeholder="Marca"
              value={vehicleDraft.brand}
              onChange={(e) => setVehicleDraft((v) => ({ ...v, brand: e.target.value }))}
            />
            <input
              className="input"
              placeholder="Modelo"
              value={vehicleDraft.model}
              onChange={(e) => setVehicleDraft((v) => ({ ...v, model: e.target.value }))}
            />
            <input
              className="input"
              placeholder="Cor"
              value={vehicleDraft.color}
              onChange={(e) => setVehicleDraft((v) => ({ ...v, color: e.target.value }))}
            />
            <input
              className="input"
              type="number"
              step={1}
              placeholder="Ano"
              value={vehicleDraft.year}
              onChange={(e) => setVehicleDraft((v) => ({ ...v, year: e.target.value }))}
            />
          </div>
          <button type="button" onClick={addVehicleDraft} className="btn-secondary">
            Adicionar veículo
          </button>

          {vehicles.length > 0 && (
            <ul className="space-y-1">
              {vehicles.map((vehicle, index) => (
                <li
                  key={`${vehicle.plate}-${index}`}
                  className="flex items-center justify-between rounded-lg bg-realce px-3 py-1.5 text-sm text-texto"
                >
                  <span>{describeVehicle(vehicle)}</span>
                  <button
                    type="button"
                    onClick={() => removeVehicleDraft(index)}
                    className="text-tenue hover:text-red-600"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && <p className="col-span-full text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="col-span-full">
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </form>
  );
}
