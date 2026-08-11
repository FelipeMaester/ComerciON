import { toE164Br } from './phone-format.util';

describe('toE164Br', () => {
  it.each([
    ['1133334444', '+551133334444'],
    ['+5511955554444', '+5511955554444'],
    ['(11) 99999-8888', '+5511999998888'],
    ['5511955554444', '+5511955554444'],
    ['5599998888', '+555599998888'], // DDD 55 local, sem código de país
  ])('normaliza %s para %s', (input, expected) => {
    expect(toE164Br(input)).toBe(expected);
  });
});
