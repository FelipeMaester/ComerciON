import type { Page } from '@playwright/test';
import { expect } from '../fixtures';

/**
 * Aperta um atalho e espera ele fazer efeito, repetindo se preciso.
 *
 * `page.goto` volta assim que o documento chega, mas atalho de teclado só
 * existe depois de o React hidratar e pendurar o ouvinte no documento. Entre
 * uma coisa e outra há uma janela em que a tecla simplesmente se perde — e ela
 * cresce quando a máquina está ocupada. Medido: os testes de atalho passam
 * sempre quando rodam sozinhos e falharam três vezes hoje dentro da suíte
 * completa, sem nada estar quebrado.
 *
 * Repetir é seguro porque o efeito é idempotente: navegar duas vezes para a
 * mesma tela dá no mesmo, e abrir uma paleta já aberta não muda nada.
 */
export async function apertarAte(page: Page, teclas: string[], confirmar: () => Promise<unknown>) {
  await expect(async () => {
    for (const tecla of teclas) await page.keyboard.press(tecla);
    await confirmar();
  }).toPass({ timeout: 15_000, intervals: [200, 400, 800, 1_500] });
}
