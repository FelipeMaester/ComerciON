import { BadRequestException } from '@nestjs/common';
import { dataDaConsulta, dataOpcionalDaConsulta, fimDoDiaDaConsulta, fimDoDiaOpcional } from './data-da-consulta';

describe('data-da-consulta', () => {
  describe('dataDaConsulta', () => {
    it('recusa lixo com 400 em vez de deixar virar Invalid Date', () => {
      // `new Date('banana')` devolve Invalid Date em silêncio e o Prisma só
      // reclamava lá na frente — o usuário via 500 em quatro rotas.
      for (const ruim of ['banana', '', '   ', undefined, null]) {
        expect(() => dataDaConsulta(ruim as string, 'from')).toThrow(BadRequestException);
      }
    });

    it('a mensagem diz qual parâmetro está errado', () => {
      expect(() => dataDaConsulta('banana', 'fromA')).toThrow(/fromA/);
    });

    it('aceita data e instante ISO', () => {
      expect(dataDaConsulta('2026-08-17', 'from').getTime()).not.toBeNaN();
      expect(dataDaConsulta('2026-08-17T14:30:00Z', 'from').toISOString()).toBe('2026-08-17T14:30:00.000Z');
    });

    it('data pura começa à meia-noite LOCAL, não UTC', () => {
      // `new Date('2026-08-17')` é meia-noite UTC — dia 16 às 21h no Brasil.
      // Um filtro "de 17/08" que começa no dia 16 traz venda do dia anterior.
      const inicio = dataDaConsulta('2026-08-17', 'from');
      expect(inicio.getDate()).toBe(17);
      expect(inicio.getHours()).toBe(0);
    });

    it('recusa dia que não existe em vez de rolar para o mês seguinte', () => {
      // `new Date(2026, 1, 31)` vira 3 de março sem avisar.
      expect(() => dataDaConsulta('2026-02-31', 'from')).toThrow(BadRequestException);
    });
  });

  describe('fimDoDiaDaConsulta', () => {
    /**
     * O período que o usuário escolhe inclui o último dia. Com meia-noite, o
     * `lte` cortava o dia inteiro: o fluxo de caixa mostrava R$ 0,00 num dia
     * com vendas, e a tela do mês corrente escondia tudo o que foi pago no
     * último dia do mês.
     */
    it('data pura vai até o fim do dia, não até a meia-noite', () => {
      const fim = fimDoDiaDaConsulta('2026-08-17', 'to');
      expect(fim.getHours()).toBe(23);
      expect(fim.getMinutes()).toBe(59);
      expect(fim.getSeconds()).toBe(59);
      expect(fim.getMilliseconds()).toBe(999);
    });

    it('um pagamento no meio do dia cai dentro de "de hoje até hoje"', () => {
      const inicio = dataDaConsulta('2026-08-17', 'from');
      const fim = fimDoDiaDaConsulta('2026-08-17', 'to');
      const pagamento = new Date(2026, 7, 17, 14, 30);

      expect(pagamento >= inicio && pagamento <= fim).toBe(true);
    });

    it('instante explícito é respeitado como veio', () => {
      // Quem mandou hora quis aquela hora — não é um filtro de "dia inteiro".
      expect(fimDoDiaDaConsulta('2026-08-17T10:00:00Z', 'to').toISOString()).toBe('2026-08-17T10:00:00.000Z');
    });

    it('lixo continua sendo 400', () => {
      expect(() => fimDoDiaDaConsulta('abacaxi', 'to')).toThrow(BadRequestException);
    });
  });

  describe('versões opcionais', () => {
    it('ausente vira undefined; presente e inválido continua 400', () => {
      expect(dataOpcionalDaConsulta(undefined, 'to')).toBeUndefined();
      expect(fimDoDiaOpcional('', 'to')).toBeUndefined();
      expect(() => fimDoDiaOpcional('banana', 'to')).toThrow(BadRequestException);
    });
  });
});
