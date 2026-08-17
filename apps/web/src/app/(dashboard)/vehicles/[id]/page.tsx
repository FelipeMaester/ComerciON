'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import { ErrorNotice } from '@/components/ErrorNotice';
import { getQuoteFlowStatus } from '@/lib/quoteStatus';
import type { Quote } from '@/lib/types';
import { formatarMoeda } from '@/lib/format';

interface VehicleHistory {
  id: string;
  plate: string;
  brand: string | null;
  model: string | null;
  color: string | null;
  year: number | null;
  customer: { id: string; name: string };
  quotes: Quote[];
}

export default function VehicleHistoryPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [vehicle, setVehicle] = useState<VehicleHistory | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<VehicleHistory>(`/customers/vehicles/${params.id}/history`)
      .then(setVehicle)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar o histórico do veículo.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  if (error) return <ErrorNotice message={error} />;
  if (!vehicle) return <p className="text-sm text-suave">Carregando…</p>;

  return (
    <div>
      <button onClick={() => router.back()} className="mb-4 text-sm text-suave hover:text-texto">
        ← Voltar
      </button>

      <div className="card mb-6 p-4">
        <h1 className="mb-1 titulo-pagina font-mono">{vehicle.plate}</h1>
        <p className="mb-3 text-sm text-suave">
          {[vehicle.brand, vehicle.model, vehicle.year, vehicle.color].filter(Boolean).join(' · ') || 'Sem detalhes cadastrados'}
        </p>
        <p className="text-sm text-suave">
          Proprietário:{' '}
          <Link href={`/customers/${vehicle.customer.id}`} className="text-texto hover:underline">
            {vehicle.customer.name}
          </Link>
        </p>
      </div>

      <h2 className="mb-3 text-lg font-medium">Histórico ({vehicle.quotes.length})</h2>

      {vehicle.quotes.length === 0 ? (
        <p className="text-sm text-tenue">Nenhum orçamento para este veículo ainda.</p>
      ) : (
        <ul className="space-y-2">
          {vehicle.quotes.map((quote) => {
            const flowStatus = getQuoteFlowStatus(quote);
            return (
              <li key={quote.id} className="card p-3 text-sm">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs text-tenue">{new Date(quote.createdAt).toLocaleString('pt-BR')}</span>
                  <span className={`${flowStatus.badgeClass} whitespace-nowrap`}>{flowStatus.label}</span>
                </div>
                <Link href={`/quotes/${quote.id}`} className="text-texto hover:underline">
                  {quote.description || 'Orçamento sem descrição'}
                </Link>
                <span className="ml-2 text-suave">{formatarMoeda(Number(quote.total))}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
