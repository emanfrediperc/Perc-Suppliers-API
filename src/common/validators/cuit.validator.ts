import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ async: false })
export class IsCuitConstraint implements ValidatorConstraintInterface {
  validate(value: any): boolean {
    if (!value || typeof value !== 'string') return false;
    const cleaned = value.replace(/-/g, '');
    if (!/^\d{11}$/.test(cleaned)) return false;

    const digits = cleaned.split('').map(Number);
    const multipliers = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    const sum = multipliers.reduce((acc, m, i) => acc + digits[i] * m, 0);

    let remainder = 11 - (sum % 11);
    if (remainder === 11) remainder = 0;
    if (remainder === 10) remainder = 9;

    return digits[10] === remainder;
  }

  defaultMessage(): string {
    return 'CUIT invalido. Debe ser un CUIT argentino valido (11 digitos)';
  }
}

export function IsCuit(options?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options,
      constraints: [],
      validator: IsCuitConstraint,
    });
  };
}
