// Datas "de calendário" (vencimento, sem hora significativa) são armazenadas
// como meia-noite UTC. Formatar com o fuso local do navegador pode exibir o
// dia anterior (ex: usuário em UTC-3 vê 09/08 para um vencimento em 10/08).
// Forçar timeZone: 'UTC' aqui mantém a data como foi digitada.
export function formatCalendarDate(value: string | Date): string {
  return new Date(value).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}
