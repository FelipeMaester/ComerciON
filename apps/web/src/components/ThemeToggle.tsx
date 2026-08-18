'use client';

import { useEffect, useState } from 'react';
import {
  aplicarPreferencias,
  lerPreferencias,
  observarTemaDoSistema,
  salvarPreferencias,
  temaEfetivo,
  type Tema,
} from '@/lib/preferencias';

/**
 * Botão de tema da barra do topo.
 *
 * Percorre os três estados em vez de alternar dois. A versão anterior só
 * trocava claro↔escuro, e isso tinha uma consequência que ninguém percebia na
 * hora: depois do primeiro clique, não havia mais volta para "seguir o
 * computador" — quem usa o modo automático do Windows ficava preso no tema
 * que escolheu numa tarde qualquer. Quem quiser ajustar sem caçar o ciclo tem
 * a mesma opção em Minha conta.
 */
const CICLO: Record<Tema, Tema> = {
  sistema: 'claro',
  claro: 'escuro',
  escuro: 'sistema',
};

const TITULO: Record<Tema, string> = {
  sistema: 'Tema: seguindo o computador. Clique para fixar o claro.',
  claro: 'Tema: claro. Clique para fixar o escuro.',
  escuro: 'Tema: escuro. Clique para voltar a seguir o computador.',
};

export function ThemeToggle() {
  const [tema, setTema] = useState<Tema>('sistema');
  // O tema real só é conhecido no navegador. Até lá o ícone fica invisível,
  // para não aparecer um sol e virar lua no primeiro instante da tela.
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    setTema(lerPreferencias().tema);
    setPronto(true);
  }, []);

  // Seguindo o computador, o ícone precisa acompanhar quando o sistema
  // operacional troca sozinho ao anoitecer.
  useEffect(() => {
    if (tema !== 'sistema') return;
    return observarTemaDoSistema(() => {
      aplicarPreferencias(lerPreferencias());
      setTema('sistema');
    });
  }, [tema]);

  function avancar() {
    const proximo = CICLO[tema];
    const prefs = { ...lerPreferencias(), tema: proximo };
    salvarPreferencias(prefs);
    aplicarPreferencias(prefs);
    setTema(proximo);
  }

  const mostrando = temaEfetivo(tema);

  return (
    <button onClick={avancar} className="btn-icone relative" aria-label={TITULO[tema]} title={TITULO[tema]}>
      <span className={pronto ? '' : 'invisible'}>
        {mostrando === 'escuro' ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" className="h-5 w-5">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" className="h-5 w-5">
            <path d="M20.5 14.4A8.6 8.6 0 0 1 9.6 3.5a8.6 8.6 0 1 0 10.9 10.9z" />
          </svg>
        )}
      </span>

      {/* Ponto no canto quando o tema está seguindo o computador: sem ele, o
          botão mostrando um sol é indistinguível de "escuro fixado". */}
      {pronto && tema === 'sistema' && (
        <span aria-hidden className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-marca" />
      )}
    </button>
  );
}
