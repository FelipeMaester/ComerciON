import { HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { HealthController } from './health.controller';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import type { DiagnosticoDeEmail } from '../mail/mail-provider.interface';

function fakeResponse() {
  const status = jest.fn();
  return { res: { status } as unknown as Response, status };
}

describe('HealthController', () => {
  function build(queryRaw: jest.Mock, diagnostico?: DiagnosticoDeEmail) {
    const mail = {
      diagnosticar: jest.fn().mockResolvedValue(diagnostico ?? { ok: true, provedor: 'stub' }),
    } as unknown as MailService;
    const controller = new HealthController({ $queryRaw: queryRaw } as unknown as PrismaService, mail);
    jest.spyOn(controller['logger'], 'error').mockImplementation(() => {});
    return controller;
  }

  describe('/health/live', () => {
    it('responde sem tocar no banco', () => {
      // Se o liveness dependesse do banco, uma queda do Postgres colocaria a
      // API em ciclo de reinício — e reiniciar não conserta banco fora.
      const queryRaw = jest.fn();
      const controller = build(queryRaw);

      expect(controller.live().status).toBe('ok');
      expect(queryRaw).not.toHaveBeenCalled();
    });
  });

  describe('/health', () => {
    it('devolve 200 e a latência quando o banco responde', async () => {
      const controller = build(jest.fn().mockResolvedValue([{ '?column?': 1 }]));
      const { res, status } = fakeResponse();

      const body = await controller.ready(res);

      expect(status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(body.status).toBe('ok');
      expect(body.checks.database.ok).toBe(true);
      expect(typeof body.checks.database.latencyMs).toBe('number');
    });

    it('devolve 503 — não 500 — quando o banco recusa', async () => {
      // "Estou fora temporariamente" é informação diferente de "quebrei", e
      // monitor e balanceador tratam as duas de formas distintas.
      const controller = build(jest.fn().mockRejectedValue(new Error('ECONNREFUSED')));
      const { res, status } = fakeResponse();

      const body = await controller.ready(res);

      expect(status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
      expect(body.status).toBe('degraded');
      expect(body.checks.database.error).toContain('ECONNREFUSED');
    });

    it('não fica pendurado quando o banco não responde', async () => {
      // O defeito que motivou a reescrita: com o banco inacessível (não
      // recusando — inacessível), a consulta ficava pendurada e o health
      // check nunca respondia. Medido: curl estourava o próprio timeout.
      jest.useFakeTimers();
      const controller = build(jest.fn().mockReturnValue(new Promise(() => {})));
      const { res, status } = fakeResponse();

      const pendente = controller.ready(res);
      await jest.advanceTimersByTimeAsync(3500);
      const body = await pendente;

      expect(status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
      expect(body.checks.database.error).toMatch(/sem resposta/);
      jest.useRealTimers();
    });

    it('diz qual dependência falhou, não só que falhou', async () => {
      const controller = build(jest.fn().mockRejectedValue(new Error('too many connections')));
      const { res } = fakeResponse();

      const body = await controller.ready(res);

      // Quem for atender um alerta às 3h precisa saber onde olhar.
      expect(body.checks.database.error).toBe('too many connections');
    });
  });
});
