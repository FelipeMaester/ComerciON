import { defineConfig, devices } from '@playwright/test';

/**
 * Testes de ponta a ponta do ComerciON.
 *
 * Rodam contra a pilha JÁ NO AR (API + painel + loja), não contra mocks — é
 * justamente o que os 416 testes unitários não cobrem. Dois defeitos reais
 * escaparam por esse buraco nesta sessão, e ambos têm teste aqui:
 *
 *   - `?search=` no PDV devolvia 400 porque o ValidationPipe recusava um
 *     parâmetro não declarado. Type-check e testes passavam.
 *   - A tela de Expedição lia o envio de um endpoint que não devolve esse
 *     campo. Como o tipo era opcional, o compilador não reclamou e a lista
 *     ficaria permanentemente vazia.
 *
 * ISOLAMENTO: cada execução cria a PRÓPRIA loja, com slug único. O
 * multi-tenancy do sistema serve de isolamento de teste — nenhum teste
 * enxerga ou estraga os dados de outro, nem os do ambiente de trabalho.
 */

const WEB_URL = process.env.E2E_WEB_URL ?? 'http://localhost:3000';
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';
const STORE_URL = process.env.E2E_STORE_URL ?? 'http://localhost:3002';

export default defineConfig({
  testDir: './tests',
  // Um teste de ponta a ponta que trava não pode segurar a suíte inteira.
  timeout: 60_000,
  expect: { timeout: 10_000 },

  // Falhar o build se alguém esquecer um .only commitado.
  forbidOnly: !!process.env.CI,

  // Uma repetição na CI absorve instabilidade de rede/timing sem esconder
  // defeito real: um teste que só passa na segunda tentativa aparece como
  // "flaky" no relatório, não como sucesso.
  retries: process.env.CI ? 1 : 0,

  // Serial na CI: os runners são pequenos e três apps Node concorrendo por
  // CPU produzem timeout que parece defeito e não é.
  workers: process.env.CI ? 1 : undefined,

  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: WEB_URL,
    // Rastro só do que falhou: em caso de erro dá para abrir o trace e ver
    // cada passo, a rede e o DOM no momento exato.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    {
      // O PDV é usado em tablet no balcão; o menu vira gaveta abaixo de 768px.
      name: 'mobile',
      testMatch: /mobile\.spec\.ts/,
      use: { ...devices['Pixel 5'] },
    },
  ],

  metadata: { apiUrl: API_URL, storeUrl: STORE_URL },
});

export { API_URL, STORE_URL, WEB_URL };
