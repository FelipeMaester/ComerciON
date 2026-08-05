import { registerDecorator, ValidationOptions } from 'class-validator';
import { isValidCpfCnpj } from './cpf-cnpj';

/** Valida CPF (11 dígitos) ou CNPJ (14 dígitos) por dígito verificador. Campo vazio passa — combine com @IsOptional() quando aplicável. */
export function IsCpfCnpj(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isCpfCnpj',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (value === undefined || value === null || value === '') return true;
          return typeof value === 'string' && isValidCpfCnpj(value);
        },
        defaultMessage() {
          return 'document deve ser um CPF ou CNPJ válido';
        },
      },
    });
  };
}
