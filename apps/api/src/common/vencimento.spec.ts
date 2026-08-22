import { estaVencida, inicioDeHoje } from './vencimento';

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
