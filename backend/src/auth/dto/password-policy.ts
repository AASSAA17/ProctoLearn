import { applyDecorators } from '@nestjs/common';
import { IsString, Matches, MaxLength, MinLength, ValidateBy } from 'class-validator';

export const PASSWORD_PATTERN = /^(?=.*\d.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?].*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).*$/;

/** bcrypt silently truncates at 72 bytes, including multibyte Unicode passwords. */
export function NewPassword() {
  return applyDecorators(
    IsString(),
    MinLength(6, { message: 'Пароль кемінде 6 таңба болуы керек' }),
    MaxLength(72, { message: 'Пароль 72 UTF-8 байттан аспауы керек' }),
    Matches(PASSWORD_PATTERN, { message: 'Пароль кемінде 2 цифр және 2 арнайы таңба болуы керек' }),
    ValidateBy({
      name: 'bcryptByteLimit',
      validator: { validate: (value) => typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= 72 },
    }, { message: 'Пароль 72 UTF-8 байттан аспауы керек' }),
  );
}
