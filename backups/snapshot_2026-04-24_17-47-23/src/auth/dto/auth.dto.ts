import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'Алибек Сейтов' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'alibek@example.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: '+77001234567' })
  @IsOptional()
  @IsString()
  @Matches(/^\+7\d{10}$/, { message: 'Телефон +7XXXXXXXXXX форматында болуы керек (11 цифр)' })
  phone?: string;

  @ApiProperty({ example: 'Pass@12', minLength: 6 })
  @IsString()
  @MinLength(6, { message: 'Пароль кемінде 6 таңба болуы керек' })
  @Matches(/^(?=.*\d.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?].*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).*$/, {
    message: 'Пароль кемінде 2 цифр және 2 арнайы таңба болуы керек',
  })
  password: string;
}

export class LoginDto {
  @ApiProperty({ example: 'alibek@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  @IsNotEmpty()
  password: string;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}

export class ChangePasswordDto {
  @ApiProperty({ example: 'OldPass@12' })
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @ApiProperty({ example: 'NewPass@12', minLength: 6 })
  @IsString()
  @MinLength(6, { message: 'Пароль кемінде 6 таңба болуы керек' })
  @Matches(/^(?=.*\d.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?].*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).*$/, {
    message: 'Пароль кемінде 2 цифр және 2 арнайы таңба болуы керек',
  })
  newPassword: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'alibek@example.com' })
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({ example: 'NewPass@12', minLength: 6 })
  @IsString()
  @MinLength(6, { message: 'Пароль кемінде 6 таңба болуы керек' })
  newPassword: string;
}

