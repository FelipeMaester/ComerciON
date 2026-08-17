import { SettingsService } from './settings.service';
import { PrismaService } from '../prisma/prisma.service';

describe('SettingsService', () => {
  let service: SettingsService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;

  beforeEach(() => {
    prisma = {
      tenant: { findUniqueOrThrow: jest.fn(), update: jest.fn() },
    };
    service = new SettingsService(prisma as unknown as PrismaService);
  });

  it('busca as configurações de marca do tenant atual', async () => {
    prisma.tenant.findUniqueOrThrow.mockResolvedValue({ name: 'Auto Peças Center', logoUrl: null });

    const result = await service.getSettings('tenant-1');

    expect(prisma.tenant.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 'tenant-1' },
      select: expect.objectContaining({ name: true, logoUrl: true, primaryColor: true }),
    });
    expect(result.name).toBe('Auto Peças Center');
  });

  it('atualiza apenas os campos enviados, sem tocar no resto do tenant', async () => {
    prisma.tenant.update.mockResolvedValue({ name: 'Novo Nome' });

    await service.updateSettings('tenant-1', { name: 'Novo Nome' });

    expect(prisma.tenant.update).toHaveBeenCalledWith({
      where: { id: 'tenant-1' },
      data: { name: 'Novo Nome' },
      select: expect.objectContaining({ logoUrl: true }),
    });
  });

  it('permite limpar um campo (ex.: remover a logo) enviando null', async () => {
    prisma.tenant.update.mockResolvedValue({ logoUrl: null });

    await service.updateSettings('tenant-1', { logoUrl: null });

    expect(prisma.tenant.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { logoUrl: null } }),
    );
  });
});
