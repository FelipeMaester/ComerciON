import { Prisma, ServiceOrderStatus } from '@prisma/client';
import { inicioDeHoje } from './vencimento';

// `inicioDeHoje` NÃO mora aqui: mora em common/vencimento.ts, cujo comentário
// diz, com todas as letras, que existe uma só "para não voltar a divergir".
// Escrevi uma segunda cópia aqui sem procurar antes — exatamente o defeito que
// este arquivo foi criado para consertar do outro lado.

/**
 * Ordem de serviço atrasada: tem dia marcado no passado e ainda está na bancada.
 *
 * Mora aqui, e não dentro de quem pergunta, porque duas partes do sistema
 * precisam da MESMA resposta: o sino de avisos ("3 atrasadas") e o contador da
 * tela de ordens de serviço. Quando cada uma tinha a sua cópia da regra, bastava
 * alguém ajustar uma para o sino e a tela passarem a discordar — e foi
 * exatamente isso que aconteceu entre o sino e a tela do financeiro.
 *
 * A comparação é com o COMEÇO de hoje, não com o instante agora: uma ordem
 * marcada para as 14h não está atrasada às 9h da manhã do mesmo dia.
 *
 * Aceita receber uma meia-noite já calculada — `inicioDeHoje` de uma meia-noite
 * é ela mesma. É o que o serviço de alertas faz: ele calcula o instante uma vez
 * e passa o mesmo para todos os contadores, para que uma requisição atravessando
 * a virada do dia não conte metade dos avisos com ontem e metade com hoje.
 */
export function filtroDeOrdemAtrasada(agora: Date = new Date()): Prisma.ServiceOrderWhereInput {
  return {
    status: { in: [ServiceOrderStatus.OPEN, ServiceOrderStatus.IN_PROGRESS] },
    scheduledAt: { lt: inicioDeHoje(agora) },
  };
}
