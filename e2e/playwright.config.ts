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

/**
 * Domínio-base usado no teste de "uma loja por subdomínio".
 *
 * NÃO é .localhost de propósito: o navegador trata cada x.localhost como um
 * SITE diferente, então o cookie de sessão (SameSite=Lax) não atravessa de
 * oficina.localhost para localhost — medido, dá 401 em tudo depois do login.
 * Com um domínio registrável de verdade em comum, atravessa normalmente, que
 * é a topologia real de produção (loja.painel.x.com.br → api.x.com.br).
 *
 * O nome é resolvido para 127.0.0.1 pelo próprio Chromium
 * (--host-resolver-rules), sem mexer no arquivo hosts da máquina.
 */
/**
 * RODE CONTRA O BUILD, NÃO CONTRA O SERVIDOR DE DESENVOLVIMENTO.
 *
 * O "next dev" compila cada rota sob demanda. Uma execução da suíte pede as
 * ~25 telas do painel em poucos minutos e, no Windows, o servidor trava:
 * passa a devolver 500 em TUDO e a suíte acusa dezenas de falhas que não
 * existem. Aconteceu duas vezes nesta sessão, e nas duas o diagnóstico
 * inicial foi errado — pareciam regressões das telas.
 *
 * Medido no mesmo commit, mesma máquina:
 *
 *   next dev    → 62 falhas em 8,5 min (o servidor morreu no meio)
 *   next build + next start → 1 falha em 39 s
 *
 * A única falha que sobra é a do subdomínio, que precisa do domínio de teste
 * no CORS_ORIGIN. É o que a CI já faz: compila os apps e sobe com "next start"
 * antes de rodar a suíte.
 *
 *   pnpm --filter web build && pnpm --filter web exec next start -p 3000
 */

export const DOMINIO_BASE_TESTE = 'painel.comercion-teste.com';

const WEB_URL = process.env.E2E_WEB_URL ?? 'http://localhost:3000';
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';

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
    // Os dois specs abaixo têm projeto próprio (domínio resolvido no
    // navegador; viewport de celular) e falhariam aqui por configuração, não
    // por defeito.
    { name: 'chromium', testIgnore: /(subdominio|mobile)\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
    {
      // Uma loja por subdomínio, na topologia de produção.
      name: 'subdominio',
      testMatch: /subdominio.spec.ts/,
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          // Tudo para o loopback, menos localhost (onde a API já responde).
          // Um MAP restrito ao domínio de teste resolveu de forma irregular
          // aqui — alguns nomes sim, outros não —, e o teste é sobre cookie,
          // não sobre DNS.
          args: ['--host-resolver-rules=MAP * 127.0.0.1, EXCLUDE localhost'],
        },
      },
    },
    {
      // O PDV é usado em tablet no balcão; o menu vira gaveta abaixo de 768px.
      name: 'mobile',
      testMatch: /mobile\.spec\.ts/,
      use: { ...devices['Pixel 5'] },
    },
  ],

  metadata: { apiUrl: API_URL },
});

export { API_URL, WEB_URL };
