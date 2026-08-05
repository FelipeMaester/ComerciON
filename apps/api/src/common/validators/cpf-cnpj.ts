export function isValidCPF(value: string): boolean {
  const cpf = value.replace(/\D/g, '');
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(cpf[i]) * (10 - i);
  let checkDigit1 = 11 - (sum % 11);
  if (checkDigit1 >= 10) checkDigit1 = 0;
  if (checkDigit1 !== Number(cpf[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(cpf[i]) * (11 - i);
  let checkDigit2 = 11 - (sum % 11);
  if (checkDigit2 >= 10) checkDigit2 = 0;
  return checkDigit2 === Number(cpf[10]);
}

function cnpjCheckDigit(base: string): number {
  // Pesos padrão do algoritmo de CNPJ: 5,4,3,2,9,8,7,6,5,4,3,2 (ciclo reinicia em 9 após o 2)
  let sum = 0;
  let pos = base.length - 7;
  for (let i = base.length; i >= 1; i--) {
    sum += Number(base.charAt(base.length - i)) * pos;
    pos -= 1;
    if (pos < 2) pos = 9;
  }
  const result = sum % 11;
  return result < 2 ? 0 : 11 - result;
}

export function isValidCNPJ(value: string): boolean {
  const cnpj = value.replace(/\D/g, '');
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;

  const digits = cnpj.substring(12);
  if (cnpjCheckDigit(cnpj.substring(0, 12)) !== Number(digits[0])) return false;
  return cnpjCheckDigit(cnpj.substring(0, 13)) === Number(digits[1]);
}

export function isValidCpfCnpj(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11) return isValidCPF(digits);
  if (digits.length === 14) return isValidCNPJ(digits);
  return false;
}
