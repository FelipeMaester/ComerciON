export interface SendMessageResult {
  externalId: string;
}

/**
 * Abstração do provedor de envio de WhatsApp. A Fase 5 usa
 * StubWhatsAppProvider (simulado — não fala com nenhuma API real). Para ir a
 * produção, troque o provider registrado em whatsapp.module.ts por uma
 * implementação real (ex.: WhatsApp Cloud API, Z-API, Evolution API) — o
 * resto do sistema (ConversationsService, AutomationsService, telas) não muda.
 */
export interface WhatsAppProvider {
  sendText(to: string, text: string): Promise<SendMessageResult>;
}

export const WHATSAPP_PROVIDER = Symbol('WHATSAPP_PROVIDER');
