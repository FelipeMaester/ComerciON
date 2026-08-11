/**
 * Payload do webhook de mensagem recebida do Twilio (form-urlencoded).
 * Deliberadamente uma interface, não uma classe: o ValidationPipe global
 * roda com `whitelist: true, forbidNonWhitelisted: true`, e o Twilio manda
 * dezenas de campos que não nos interessam (AccountSid, ApiVersion,
 * NumSegments, WaId, ProfileName, etc.) — uma classe validada rejeitaria o
 * webhook inteiro. Além disso, a validação de assinatura (TwilioSignatureGuard)
 * precisa do corpo exatamente como o Twilio mandou, sem nada removido.
 */
export interface TwilioInboundWebhookPayload {
  From: string;
  Body: string;
  MessageSid: string;
  To?: string;
  [key: string]: string | undefined;
}
