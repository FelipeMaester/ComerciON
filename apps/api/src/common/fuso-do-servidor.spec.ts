import { Logger } from '@nestjs/common';
import { conferirFusoDoServidor } from './fuso-do-servidor';

/**
 * O aviso existe porque o defeito é mudo: em UTC o sistema erra o dia durante
 * três horas por dia, sem nenhum erro na tela nem no log.
 */
describe('conferirFusoDoServidor', () => {
  function logadorFalso() {
    return { warn: jest.fn(), log: jest.fn() } as unknown as Logger & { warn: jest.Mock; log: jest.Mock };
  }

  it('avisa quando o servidor está em UTC', () => {
    const logger = logadorFalso();

    conferirFusoDoServidor(logger, 'UTC', 0);

    expect(logger.warn).toHaveBeenCalledTimes(1);
    // A mensagem precisa dizer O QUE fazer: "fuso errado" sem o nome da
    // variável manda a pessoa procurar.
    expect(logger.warn.mock.calls[0][0]).toContain('TZ=America/Sao_Paulo');
    expect(logger.log).not.toHaveBeenCalled();
  });

  it('fica quieto quando há fuso definido', () => {
    const logger = logadorFalso();

    conferirFusoDoServidor(logger, 'America/Sao_Paulo', -180);

    // Controle: registra qual é, sem alarme. Um aviso que aparece sempre é um
    // aviso que ninguém lê.
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.log.mock.calls[0][0]).toContain('America/Sao_Paulo');
  });
});
