/**
 * Normaliza telefone pro formato E.164 exigido por provedores reais de
 * WhatsApp (ex.: Twilio). Os telefones já cadastrados no banco estão em
 * formatos inconsistentes ('1133334444', '+5511955554444', '(11) 99999-8888')
 * — essa função assume Brasil (código 55) quando o número não vem com
 * código de país.
 */
export function toE164Br(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (phone.trim().startsWith('+')) return `+${digits}`;
  if (digits.startsWith('55') && digits.length > 11) return `+${digits}`;
  return `+55${digits}`;
}
