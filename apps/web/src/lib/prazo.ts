/**
 * Quanto falta (ou faz) para uma data, em português de gente.
 *
 * Existe para as três telas que falam de vencimento — a venda, o Financeiro e
 * o sino — dizerem a mesma coisa do mesmo jeito. Antes cada uma mostrava só a
 * data, e "18/09" obriga quem lê a fazer a conta de cabeça no meio do
 * atendimento.
 *
 * A comparação é por DIA, não por instante: uma conta que vence hoje às 23h
 * não "vence em 0,4 dia", vence hoje. Sem zerar as horas, o mesmo vencimento
 * apareceria como "hoje" de manhã e "amanhã" à tarde.
 */
export interface Prazo {
  /** Negativo quando já passou. */
  dias: number;
  /** "vence hoje", "faltam 3 dias", "venceu há 2 dias". */
  texto: string;
  vencido: boolean;
  /** Dentro da janela em que vale avisar (3 dias, o mesmo do sino). */
  proximo: boolean;
}

/** Mesma antecedência do aviso no sino (DIAS_DE_ANTECEDENCIA, na API). */
export const DIAS_DE_ANTECEDENCIA = 3;

export function calcularPrazo(vencimento: string | Date, hoje = new Date()): Prazo {
  const inicioDeHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const alvo = new Date(vencimento);
  const inicioDoVencimento = new Date(alvo.getFullYear(), alvo.getMonth(), alvo.getDate());

  const dias = Math.round((inicioDoVencimento.getTime() - inicioDeHoje.getTime()) / (24 * 60 * 60 * 1000));

  if (dias < 0) {
    const atraso = Math.abs(dias);
    return {
      dias,
      texto: atraso === 1 ? 'venceu ontem' : `venceu há ${atraso} dias`,
      vencido: true,
      proximo: false,
    };
  }
  if (dias === 0) return { dias, texto: 'vence hoje', vencido: false, proximo: true };
  if (dias === 1) return { dias, texto: 'vence amanhã', vencido: false, proximo: true };

  return {
    dias,
    texto: `faltam ${dias} dias`,
    vencido: false,
    proximo: dias <= DIAS_DE_ANTECEDENCIA,
  };
}

/** Classe de cor conforme a urgência — vermelho só para o que já venceu. */
export function corDoPrazo(prazo: Prazo): string {
  if (prazo.vencido) return 'text-red-600 dark:text-red-400';
  if (prazo.proximo) return 'text-amber-600 dark:text-amber-400';
  return 'text-suave';
}
