-- Novo gatilho de automação: conta a receber VENCENDO em N dias.
--
-- O que existia era só RECEIVABLE_OVERDUE_DAYS, que dispara depois do
-- vencimento — cobrança corretiva. Este dispara antes, que é o que evita o
-- atraso em vez de correr atrás dele: um lembrete três dias antes costuma
-- resolver a maioria dos fiados sem ninguém precisar telefonar.
ALTER TYPE "AutomationTrigger" ADD VALUE 'RECEIVABLE_DUE_IN_DAYS';
