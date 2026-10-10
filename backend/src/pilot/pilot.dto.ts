import { Transform } from 'class-transformer';
import { IsEmail, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreatePilotInvitationDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(168)
  expiresInHours?: number;
}

export class SuspendPilotMemberDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  @Matches(/\S/)
  reason: string;
}
