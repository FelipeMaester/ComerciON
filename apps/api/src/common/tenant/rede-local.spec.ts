import { ehEnderecoDeRedeLocal, modoRedeLocal } from './rede-local';
import { origemPermitida } from './origem-permitida';

describe('modo rede local', () => {
  /**
   * Ligar por engano é o risco: a variável fica no .env de produção e alguém
   * copia o arquivo. Só a palavra exata liga.
   */
  it('só liga com "true", exato', () => {
    expect(modoRedeLocal('true')).toBe(true);
    for (const valor of ['TRUE', 'True', '1', 'sim', 'yes', '', ' true', undefined, null]) {
      expect(modoRedeLocal(valor)).toBe(false);
    }
  });

  describe('o que conta como rede local', () => {
    it('aceita as três faixas privadas e a própria máquina', () => {
      for (const host of ['192.168.0.10', '10.0.0.5', '172.16.4.1', '172.31.255.254', 'localhost', '127.0.0.1']) {
        expect(ehEnderecoDeRedeLocal(host)).toBe(true);
      }
    });

    /**
     * A lista é fechada de propósito. Se um nome de domínio passasse, o modo
     * de rede local viraria, por descuido, permissão para a internet.
     */
    it('recusa endereço público e qualquer nome de domínio', () => {
      for (const host of [
        'painel.minhaloja.com.br',
        'evil.com',
        '8.8.8.8',
        '172.15.0.1', // logo abaixo da faixa privada
        '172.32.0.1', // logo acima
        '192.169.0.1', // um dígito de diferença
        '11.0.0.1',
        'localhost.evil.com',
      ]) {
        expect(ehEnderecoDeRedeLocal(host)).toBe(false);
      }
    });

    it('recusa lixo que não é endereço', () => {
      for (const host of ['', '192.168.0', '192.168.0.1.2', '192.168.0.256', 'a.b.c.d', '192.168.0.-1']) {
        expect(ehEnderecoDeRedeLocal(host)).toBe(false);
      }
    });
  });

  describe('CORS com o modo ligado', () => {
    const CONFIGURADA = 'http://localhost:3000';

    it('aceita o painel aberto pelo IP da máquina na rede', () => {
      expect(origemPermitida('http://192.168.0.10:3000', CONFIGURADA, null, true)).toBe(true);
    });

    /**
     * A porta continua presa: sem isso, qualquer serviço rodando na mesma
     * máquina da loja poderia falar com a API levando a credencial junto.
     */
    it('não aceita outra porta, mesmo em rede privada', () => {
      expect(origemPermitida('http://192.168.0.10:8080', CONFIGURADA, null, true)).toBe(false);
    });

    it('não aceita endereço público nem com o modo ligado', () => {
      expect(origemPermitida('http://evil.com:3000', CONFIGURADA, null, true)).toBe(false);
      expect(origemPermitida('https://painel.outraloja.com.br:3000', CONFIGURADA, null, true)).toBe(false);
    });

    it('desligado, o IP da rede continua recusado — é o padrão', () => {
      expect(origemPermitida('http://192.168.0.10:3000', CONFIGURADA, null, false)).toBe(false);
    });

    it('a origem configurada continua valendo, ligado ou desligado', () => {
      expect(origemPermitida(CONFIGURADA, CONFIGURADA, null, false)).toBe(true);
      expect(origemPermitida(CONFIGURADA, CONFIGURADA, null, true)).toBe(true);
    });
  });
});
