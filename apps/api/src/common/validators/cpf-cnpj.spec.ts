import { isValidCNPJ, isValidCPF, isValidCpfCnpj } from './cpf-cnpj';

describe('isValidCPF', () => {
  it('aceita CPFs válidos conhecidos', () => {
    expect(isValidCPF('111.444.777-35')).toBe(true);
    expect(isValidCPF('11144477735')).toBe(true);
  });

  it('rejeita CPFs com dígito verificador errado', () => {
    expect(isValidCPF('111.444.777-36')).toBe(false);
  });

  it('rejeita sequências repetidas e tamanhos inválidos', () => {
    expect(isValidCPF('111.111.111-11')).toBe(false);
    expect(isValidCPF('123')).toBe(false);
  });
});

describe('isValidCNPJ', () => {
  it('aceita CNPJs válidos conhecidos', () => {
    expect(isValidCNPJ('11.222.333/0001-81')).toBe(true);
    expect(isValidCNPJ('11222333000181')).toBe(true);
  });

  it('rejeita CNPJs com dígito verificador errado', () => {
    expect(isValidCNPJ('11.222.333/0001-82')).toBe(false);
  });

  it('rejeita sequências repetidas e tamanhos inválidos', () => {
    expect(isValidCNPJ('11.111.111/1111-11')).toBe(false);
    expect(isValidCNPJ('123')).toBe(false);
  });
});

describe('isValidCpfCnpj', () => {
  it('detecta o tipo pelo tamanho e valida', () => {
    expect(isValidCpfCnpj('11144477735')).toBe(true);
    expect(isValidCpfCnpj('11222333000181')).toBe(true);
    expect(isValidCpfCnpj('12345')).toBe(false);
  });
});
