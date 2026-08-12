import { Global, Module } from '@nestjs/common';
import { JobLockService } from './job-lock.service';

/**
 * Global pelo mesmo motivo do MailModule: o lock de job é infraestrutura
 * transversal. Três módulos já precisam dele hoje e qualquer @Cron novo
 * deveria usá-lo, então exigir o import em cada um só cria a chance de
 * alguém esquecer — e o esquecimento aqui é silencioso.
 */
@Global()
@Module({
  providers: [JobLockService],
  exports: [JobLockService],
})
export class SchedulingModule {}
