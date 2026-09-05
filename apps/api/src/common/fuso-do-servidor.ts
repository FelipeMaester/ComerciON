import { Logger } from '@nestjs/common';

/**
 * O fuso do servidor É a definição de "hoje" para o sistema inteiro.
 *
 * O código lê data pura no fuso do processo de propósito — está escrito em
 * `data-da-consulta.ts`, com a razão: `new Date('2026-08-17')` é meia-noite
 * UTC pela especificação, que no Brasil é dia 16 às 21h. `inicioDeHoje` em
 * `vencimento.ts` faz o mesmo.
 *
 * Só que ninguém dizia ao processo qual era o fuso. Container sem TZ roda em
 * UTC, e aí o cuidado todo passa a calcular dias brasileiros três horas
 * adiantado. Medido numa sexta às 21h17: a venda entrou como sábado, e o
 * relatório "de 04/09 até 04/09" — o dia que a pessoa acabou de trabalhar —
 * voltou zerado.
 *
 * Nada disso dá erro. Por isso este aviso: um sistema que erra o dia em
 * silêncio durante três horas por dia precisa, no mínimo, dizer que está
 * assim.
 */
/**
 * O fuso e a diferença entram por parâmetro porque o fuso do processo é
 * fixado na PARTIDA: mudar process.env.TZ depois não muda
 * getTimezoneOffset(), e o teste não teria como exercitar o caso do UTC.
 * A leitura é o padrão; o que vale testar é a decisão.
 */
export function conferirFusoDoServidor(
  logger = new Logger('Fuso'),
  fuso = Intl.DateTimeFormat().resolvedOptions().timeZone,
  minutosDeDiferenca = -new Date().getTimezoneOffset(),
): string {

  if (minutosDeDiferenca === 0) {
    logger.warn(
      `O servidor está em ${fuso} (UTC+0). Se a loja não fica no fuso de Greenwich, ` +
        'todo cálculo de "hoje" — vendas do dia, fechamento de caixa, contas vencidas, ' +
        'relatório por período — vai usar o dia errado nas horas em que os dois fusos ' +
        'discordam. Defina TZ no ambiente (ex.: TZ=America/Sao_Paulo).',
    );
  } else {
    logger.log(`Fuso do servidor: ${fuso} (UTC${minutosDeDiferenca >= 0 ? '+' : ''}${minutosDeDiferenca / 60}).`);
  }

  return fuso;
}
