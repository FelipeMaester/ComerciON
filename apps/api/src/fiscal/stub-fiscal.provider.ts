import { Injectable } from '@nestjs/common';
import { FiscalProvider, FiscalProviderError, IssueInvoiceParams, IssueInvoiceResult } from './fiscal-provider.interface';

/**
 * Implementação simulada — NÃO emite nota fiscal real, não fala com SEFAZ.
 *
 * É o padrão do sistema: quem ainda não contratou um provedor consegue usar o
 * fluxo inteiro (emitir, cancelar, carta de correção, impressão) sem nada
 * configurado. Gera uma chave com o formato correto de 44 dígitos só para as
 * telas e as validações funcionarem de ponta a ponta.
 */
@Injectable()
export class StubFiscalProvider implements FiscalProvider {
  async issue(params: IssueInvoiceParams): Promise<IssueInvoiceResult> {
    const accessKey = this.generateFakeAccessKey();
    const number = String(Math.floor(Math.random() * 900_000) + 100_000);

    const xmlContent = [
      '<!-- XML SIMULADO — nenhuma integração real com a SEFAZ -->',
      `<!-- tipo=${params.type} ref=${params.ref} valor=${params.totalAmount.toFixed(2)} -->`,
      `<!-- emitente=${params.emitter.cnpj} itens=${params.items.length} -->`,
      `<!-- chaveAcesso=${accessKey} numero=${number} -->`,
    ].join('\n');

    return {
      accessKey,
      series: '1',
      number,
      xmlContent,
      sefazStatus: 'simulado',
      sefazMessage: 'Nota simulada — sem valor fiscal.',
    };
  }

  async cancel(_ref: string, _accessKey: string, reason: string): Promise<void> {
    // Mesma regra do provedor real, para o comportamento não mudar ao trocar:
    // a SEFAZ exige justificativa de no mínimo 15 caracteres.
    if (reason.trim().length < 15) {
      throw new FiscalProviderError('A justificativa de cancelamento precisa ter pelo menos 15 caracteres.');
    }
  }

  private generateFakeAccessKey(): string {
    let key = '';
    for (let i = 0; i < 44; i++) key += Math.floor(Math.random() * 10);
    return key;
  }
}
