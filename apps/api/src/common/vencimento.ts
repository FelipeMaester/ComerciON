/**
 * Vencida é a conta cujo DIA de vencimento já passou — não o instante.
 *
 * Parece detalhe e não é. Uma conta a receber criada hoje às 19h, vencendo
 * hoje, tem `dueDate` às 19h; qualquer comparação com "agora" feita às 19h01
 * responde que ela está vencida. Foi o que acontecia: uma ordem de serviço
 * concluída no balcão aparecia como "Vencido" na mesma tela em que se lia
 * "vence hoje", e o lojista tinha duas respostas contraditórias na mesma linha.
 *
 * Pior que a etiqueta errada era a consequência: o lembrete automático de
 * cobrança usava a mesma comparação e mandava ao cliente "identificamos uma
 * pendência vencida em 21/08" no próprio dia 21/08. A loja acusando de atraso
 * quem estava em dia.
 *
 * O painel já tratava isso por dia (`prazo.ts`, que diz "vence hoje" e não
 * "vencido"). A API é que tinha duas regras convivendo: o sino e o painel
 * comparavam com o início do dia, o Financeiro e as automações comparavam com o
 * instante. Agora é uma só, e mora aqui para não voltar a divergir.
 *
 * A conta é em horário local, como já era nos dois lugares que acertavam: o
 * "hoje" que importa é o do relógio da loja, não o de Greenwich.
 */
export function inicioDeHoje(agora: Date = new Date()): Date {
  return new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
}

/**
 * A conta passou do prazo?
 *
 * Vencer hoje NÃO é estar vencida — o cliente tem o dia inteiro para pagar.
 */
export function estaVencida(vencimento: Date, agora: Date = new Date()): boolean {
  return vencimento < inicioDeHoje(agora);
}

/**
 * O corte de "há N dias", contado por dia — para usar como `{ lt: haDias(n) }`.
 *
 * As automações contavam com `Date.now() - n * 24h`, que é "N vezes 24 horas
 * atrás". Parece a mesma coisa e não é: o job varre uma vez por dia, às 10h,
 * então duas contas vencidas no MESMO dia eram cobradas em dias diferentes —
 * a que venceu de manhã entrava, a que venceu de tarde só no dia seguinte.
 * Invisível para o lojista, que vê duas contas iguais tratadas de formas
 * diferentes sem nada explicando.
 *
 * Ninguém diz "esse orçamento está parado há três dias" querendo dizer 72
 * horas. Diz olhando o calendário. Este corte conta assim: com `dias = 3`,
 * devolve a meia-noite de anteontem, e `lt` pega tudo cujo dia seja 3 ou mais
 * dias atrás — independentemente da hora.
 *
 *   hoje = dia 0        haDias(1) = dia 0 às 00:00   → pega ontem para trás
 *                       haDias(3) = dia -2 às 00:00  → pega o dia -3 para trás
 *
 * Espera `dias >= 1`. Zero ou negativo não tem significado nas regras que a
 * usam ("parado há 0 dias" não é uma pergunta que alguém faça), e o catálogo
 * já exige um número positivo na configuração.
 */
export function haDias(dias: number, agora: Date = new Date()): Date {
  const corte = inicioDeHoje(agora);
  corte.setDate(corte.getDate() - (dias - 1));
  return corte;
}
