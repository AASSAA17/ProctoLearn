import { IsBoolean, IsString, MaxLength, MinLength } from 'class-validator';

export class EvidenceHoldDto {
  @IsBoolean()
  onHold: boolean;

  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  reason: string;
}
