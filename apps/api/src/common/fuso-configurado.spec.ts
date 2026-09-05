import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * O `TZ` precisa continuar declarado no compose.
 *
 * Este é o teste que faltava quando o defeito existiu. O código de datas já
 * estava certo — lê data pura no fuso do processo de propósito, com a razão
 * escrita em `data-da-consulta.ts`. O que faltava era alguém DIZER ao processo
 * qual era o fuso, e nada no projeto reclamava disso.
 *
 * A suíte de ponta a ponta não pega: no CI o processo de teste e a API rodam
 * na mesma máquina, então concordam entre si e passam mesmo em UTC. Só quem
 * está no Brasil, depois das 21h, vê a diferença — e aí já está em produção.
 *
 * Por isso a asserção é sobre a CONFIGURAÇÃO, e não sobre o comportamento:
 * é o arquivo que some, não a lógica.
 */
describe('fuso do servidor na configuração', () => {
  const raiz = join(__dirname, '../../../..');

  it('o serviço da API declara TZ no docker-compose', () => {
    const compose = readFileSync(join(raiz, 'docker-compose.yml'), 'utf8');
    const servicoApi = compose.slice(compose.indexOf('\n  api:'), compose.indexOf('\n  web:'));

    expect(servicoApi).toContain('TZ:');
    // Com padrão: quem sobe sem mexer no .env não pode cair em UTC por omissão,
    // que era exatamente o caminho do defeito.
    expect(servicoApi).toMatch(/TZ:\s*\$\{TZ:-[A-Za-z]+\/[A-Za-z_]+\}/);
  });

  it('o .env.example ensina o que a variável faz', () => {
    const exemplo = readFileSync(join(raiz, '.env.example'), 'utf8');

    expect(exemplo).toMatch(/^TZ=/m);
    // Sem o "por quê", a linha vira ruído e a próxima pessoa a apaga. O defeito
    // é mudo: nada quebra, os números só ficam errados três horas por dia.
    expect(exemplo).toMatch(/UTC/);
  });
});
