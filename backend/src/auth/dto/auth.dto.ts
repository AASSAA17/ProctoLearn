import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NewPassword } from './password-policy';

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

  @ApiProperty({ example: 'Pass!!12', minLength: 6, maxLength: 72 })
  @NewPassword()
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

// Refresh credentials are accepted only from the HttpOnly cookie; body fields are forbidden.
export class RefreshTokenDto {}

export class ChangePasswordDto {
  @ApiProperty({ example: 'OldPass@12' })
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @ApiProperty({ example: 'NewPass!!12', minLength: 6, maxLength: 72 })
  @NewPassword()
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

  @ApiProperty({ example: 'NewPass!!12', minLength: 6, maxLength: 72 })
  @NewPassword()
  newPassword: string;
}

