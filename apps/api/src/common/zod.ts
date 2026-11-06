import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

/** Mensajes de validación en español para los casos más comunes. */
const spanishErrorMap: z.ZodErrorMap = (issue, ctx) => {
  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      return { message: issue.received === 'undefined' ? 'Campo obligatorio.' : 'Tipo de dato inválido.' };
    case z.ZodIssueCode.too_small:
      return { message: issue.type === 'string' ? (Number(issue.minimum) <= 1 ? 'No puede estar vacío.' : `Mínimo ${issue.minimum} caracteres.`) : `Valor mínimo: ${issue.minimum}.` };
    case z.ZodIssueCode.too_big:
      return { message: issue.type === 'string' ? `Máximo ${issue.maximum} caracteres.` : `Valor máximo: ${issue.maximum}.` };
    case z.ZodIssueCode.invalid_enum_value:
      return { message: 'Valor no permitido.' };
    case z.ZodIssueCode.invalid_string:
      return { message: issue.validation === 'email' ? 'Email inválido.' : 'Formato inválido.' };
    default:
      return { message: ctx.defaultError };
  }
};
z.setErrorMap(spanishErrorMap);

/** Valida un payload con Zod y devuelve un 400 con errores legibles. */
export function parse<S extends z.ZodTypeAny>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new BadRequestException({
      message: result.error.issues[0]?.message ?? 'Datos inválidos',
      errors: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  return result.data;
}
