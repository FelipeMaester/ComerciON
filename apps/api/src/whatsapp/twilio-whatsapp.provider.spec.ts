const mockCreate = jest.fn();

jest.mock('twilio', () => {
  return jest.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  }));
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
import { TwilioWhatsAppProvider } from './twilio-whatsapp.provider';

describe('TwilioWhatsAppProvider', () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it('manda a mensagem com from/to/body corretos e devolve o sid como externalId', async () => {
    mockCreate.mockResolvedValue({ sid: 'SM123' });
    const provider = new TwilioWhatsAppProvider('AC123', 'token', 'whatsapp:+14155238886');

    const result = await provider.sendText('11999998888', 'Olá!');

    expect(mockCreate).toHaveBeenCalledWith({
      from: 'whatsapp:+14155238886',
      to: 'whatsapp:+5511999998888',
      body: 'Olá!',
    });
    expect(result).toEqual({ externalId: 'SM123' });
  });
});
