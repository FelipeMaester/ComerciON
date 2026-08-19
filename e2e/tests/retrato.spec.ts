import { expect, test, API_URL } from '../fixtures';

const SAIDA = 'C:/Users/Maester/AppData/Local/Temp/claude/D--claude-code/878bda87-27b0-4f8f-9ab4-314bb5fa7190/scratchpad/design';

test('retrato do design atual', async ({ page, request }) => {
  const login = await request.post(`${API_URL}/api/auth/login`, {
    headers: { 'x-tenant-slug': 'demo' },
    data: { email: 'admin@demo.local', password: 'Demo1234' },
  });
  const { accessToken, refreshToken } = await login.json();
  await page.context().addCookies([
    { name: 'comercion_access', value: accessToken, url: API_URL },
    { name: 'comercion_refresh', value: refreshToken, url: API_URL },
  ]);
  await page.addInitScript(() => {
    localStorage.setItem('erp.tenantSlug', 'demo');
    localStorage.setItem('erp.role', 'ADMIN');
  });

  for (const [nome, rota] of [['dashboard', '/dashboard'], ['produtos', '/products'], ['vendas', '/sales'], ['pdv', '/pos']] as const) {
    await page.goto(rota);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${SAIDA}/claro-${nome}.png` });
  }

  // Mesmo dashboard no escuro.
  await page.evaluate(() => localStorage.setItem('comercion.preferencias', JSON.stringify({ tema: 'escuro' })));
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `${SAIDA}/escuro-dashboard.png` });
  expect(true).toBe(true);
});
