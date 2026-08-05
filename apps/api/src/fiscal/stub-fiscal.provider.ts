import { Injectable } from '@nestjs/common';
import { FiscalProvider, IssueInvoiceParams, IssueInvoiceResult } from './fiscal-provider.interface';

/**
 * Implementação simulada — NÃO emite nota fiscal real, não fala com SEFAZ.
 * Gera uma chave de acesso com o formato correto (44 dígitos) e um XML
 * placeholder só para o fluxo de UI/negócio funcionar de ponta a ponta.
 */
@Injectable()
export class StubFiscalProvider implements FiscalProvider {
  async issue(params: IssueInvoiceParams): Promise<IssueInvoiceResult> {
    const accessKey = this.generateFakeAccessKey();
    const number = String(Math.floor(Math.random() * 900_000) + 100_000);
    const xmlContent = [
      '<!-- XML SIMULADO — Fase 4 não tem integração real com SEFAZ/Focus NFe -->',
      `<!-- tipo=${params.type} venda=${params.saleId} valor=${params.totalAmount.toFixed(2)} -->`,
      `<!-- chaveAcesso=${accessKey} numero=${number} -->`,
    ].join('\n');

    return { accessKey, series: '1', number, xmlContent };
  }

  async cancel(_accessKey: string, _reason: string): Promise<void> {
    // Provider real chamaria o endpoint de cancelamento da SEFAZ/provedor aqui.
  }

  private generateFakeAccessKey(): string {
    let key = '';
    for (let i = 0; i < 44; i++) key += Math.floor(Math.random() * 10);
    return key;
  }
}
