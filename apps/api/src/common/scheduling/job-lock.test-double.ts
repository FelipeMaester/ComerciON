import { JobLockService } from './job-lock.service';

/**
 * Dublê do lock para os testes de serviços que têm @Cron: sempre concede e
 * executa o trabalho, para o teste continuar sendo sobre o que o job faz.
 *
 * O comportamento do lock em si (barrar a segunda instância, liberar em caso
 * de erro) é coberto em job-lock.service.spec.ts, e contra o Postgres de
 * verdade — não faz sentido reimplementar isso em cada spec.
 */
export function jobLockAlwaysGrants(): JobLockService {
  return {
    runExclusively: async (_name: string, work: () => Promise<void>) => {
      await work();
      return true;
    },
  } as unknown as JobLockService;
}
