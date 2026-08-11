// Repasse da taxa da maquininha de cartão de crédito: dado um valor base que
// o lojista quer efetivamente receber, calcula quanto cobrar do cliente para
// que, depois da operadora descontar a taxa sobre o valor cobrado, sobre
// exatamente o valor base ("cálculo por dentro" — padrão usado pelas
// calculadoras de repasse de taxa no Brasil).
export function grossUpForCardFee(baseAmount: number, feePercent: number): number {
  if (!feePercent || baseAmount <= 0) return Math.round(baseAmount * 100) / 100;
  const factor = 1 - feePercent / 100;
  if (factor <= 0) return Math.round(baseAmount * 100) / 100;
  return Math.round((baseAmount / factor) * 100) / 100;
}

export function cardFeeAmount(baseAmount: number, feePercent: number): number {
  return Math.round((grossUpForCardFee(baseAmount, feePercent) - baseAmount) * 100) / 100;
}
