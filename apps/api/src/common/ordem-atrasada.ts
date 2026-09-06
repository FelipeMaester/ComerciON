import { Prisma, ServiceOrderStatus } from '@prisma/client';

/**
 * A meia-noite de hoje, no fuso do servidor.
 *
 * Construído com `new Date(ano, mes, dia)` e não com string: `new Date('2026-09-06')`
 * é meia-noite em UTC por especificação, o que no Brasil é 21h do dia anterior.
 * Este projeto já foi mordido por isso — o sistema virava o dia às 21h e o
 * relatório do dia trabalhado voltava zerado. Por isso o processo roda com TZ
 * definido (ver docker-compose.yml e conferirFusoDoServidor).
 */
export function inicioDeHoje(agora: Date = new Date()): Date {
  return new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
}

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
