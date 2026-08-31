import { estaVencida, haDias, inicioDeHoje } from './vencimento';

describe('vencimento — vencida é por dia, não por instante', () => {
  /** 21/08/2026, 19h02 — o instante em que a ordem de serviço foi concluída. */
  const agora = new Date(2026, 7, 21, 19, 2, 15);

  it('o corte é a meia-noite de hoje', () => {
    const corte = inicioDeHoje(agora);

    expect(corte.getFullYear()).toBe(2026);
    expect(corte.getMonth()).toBe(7);
    expect(corte.getDate()).toBe(21);
    expect([corte.getHours(), corte.getMinutes(), corte.getSeconds(), corte.getMilliseconds()]).toEqual([0, 0, 0, 0]);
  });

  it('a conta criada agora, vencendo hoje, NÃO está vencida um minuto depois', () => {
    // O defeito inteiro em uma linha. A ordem de serviço concluída às 19h02
    // gravava vencimento às 19h02; a tela, carregada às 19h03, comparava com o
    // instante e respondia "Vencido" — ao lado de "vence hoje", na mesma linha.
    const vencimento = new Date(2026, 7, 21, 19, 2, 15);
    const umMinutoDepois = new Date(2026, 7, 21, 19, 3, 15);

    expect(estaVencida(vencimento, umMinutoDepois)).toBe(false);
  });

  it('vencer hoje continua em dia às 23h59 — o cliente tem o dia inteiro', () => {
    expect(estaVencida(new Date(2026, 7, 21, 8, 0), new Date(2026, 7, 21, 23, 59, 59))).toBe(false);
  });

  it('ontem está vencida, mesmo que faltem segundos para virar o dia', () => {
    expect(estaVencida(new Date(2026, 7, 20, 23, 59, 59), agora)).toBe(true);
  });

  it('amanhã não está vencida', () => {
    expect(estaVencida(new Date(2026, 7, 22, 0, 0, 1), agora)).toBe(false);
  });
});

describe('haDias — "há N dias" contado por dia, não por 24 horas', () => {
  /** 21/08/2026, 10h — a hora em que o job de automações varre. */
  const dezDaManha = new Date(2026, 7, 21, 10, 0, 0);

  /** O corte pega este registro? É como as regras usam: `{ lt: haDias(n) }`. */
  const pega = (quando: Date, dias: number) => quando < haDias(dias, dezDaManha);

  it('duas contas do MESMO dia são tratadas igual, de manhã ou de tarde', () => {
    // O defeito inteiro. Com `agora - 3 dias`, a de 9h entrava e a de 15h
    // não — mesma idade no calendário, cobranças em dias diferentes, e nada
    // na tela explicando a diferença.
    const manha = new Date(2026, 7, 18, 9, 0);
    const tarde = new Date(2026, 7, 18, 15, 0);

    expect(pega(manha, 3)).toBe(true);
    expect(pega(tarde, 3)).toBe(true);
  });

  it('o dia exato entra; o dia seguinte a ele, não', () => {
    // A fronteira. Com dias=3 e hoje 21/08: o dia 18 entra (são 3 dias),
    // o dia 19 não (são 2).
    expect(pega(new Date(2026, 7, 18, 23, 59), 3)).toBe(true);
    expect(pega(new Date(2026, 7, 19, 0, 0), 3)).toBe(false);
  });

  it('há 1 dia é ontem, e não vinte e quatro horas atrás', () => {
    expect(pega(new Date(2026, 7, 20, 23, 59), 1)).toBe(true);
    // Hoje de madrugada tem menos de 24h, mas é HOJE — não é "há 1 dia".
    expect(pega(new Date(2026, 7, 21, 0, 1), 1)).toBe(false);
  });

  it('o corte cai na meia-noite, e não na hora em que o job rodou', () => {
    const corte = haDias(3, dezDaManha);
    expect([corte.getHours(), corte.getMinutes(), corte.getSeconds()]).toEqual([0, 0, 0]);
    // hoje 21 menos (3-1) = dia 19 às 00:00.
    expect(corte.getDate()).toBe(19);
  });
});