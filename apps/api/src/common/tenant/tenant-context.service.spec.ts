import { TenantContextService } from './tenant-context.service';

describe('TenantContextService', () => {
  let service: TenantContextService;

  beforeEach(() => {
    service = new TenantContextService();
  });

  it('retorna undefined fora de um run()', () => {
    expect(service.tenantId).toBeUndefined();
    expect(service.get()).toBeUndefined();
  });

  it('expõe tenantId/userId/role dentro do run()', () => {
    service.run({ tenantId: 'tenant-1', userId: 'user-1', role: 'ADMIN' }, () => {
      expect(service.tenantId).toBe('tenant-1');
      expect(service.userId).toBe('user-1');
      expect(service.role).toBe('ADMIN');
    });
  });

  it('isola o contexto entre chamadas assíncronas concorrentes', async () => {
    const results: string[] = [];

    const runA = service.run({ tenantId: 'tenant-A' }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      results.push(`A saw ${service.tenantId}`);
    });

    const runB = service.run({ tenantId: 'tenant-B' }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      results.push(`B saw ${service.tenantId}`);
    });

    await Promise.all([runA, runB]);

    expect(results).toContain('A saw tenant-A');
    expect(results).toContain('B saw tenant-B');
  });

  it('um run() aninhado sobrescreve o contexto apenas para seu próprio escopo', () => {
    service.run({ tenantId: 'outer' }, () => {
      expect(service.tenantId).toBe('outer');
      service.run({ tenantId: 'inner' }, () => {
        expect(service.tenantId).toBe('inner');
      });
      expect(service.tenantId).toBe('outer');
    });
  });
});
