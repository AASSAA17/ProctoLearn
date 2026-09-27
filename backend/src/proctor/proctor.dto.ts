import { IsIn, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export const TRUST_SCORE_DEDUCTIONS = {
  tab_switch: 10,
  copy_paste: 15,
  fullscreen_exit: 5,
  face_not_detected: 20,
  paste: 15,
  screen_share_stopped: 10,
  screen_share_denied: 10,
} as const;

export class SessionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  attemptId: string;
}

export class StartSessionDto extends SessionDto {
  @IsIn(['student', 'proctor'])
  role: 'student' | 'proctor';
}

export class ProctorEventDto extends SessionDto {
  @IsIn(Object.keys(TRUST_SCORE_DEDUCTIONS))
  type: keyof typeof TRUST_SCORE_DEDUCTIONS;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class ReviewAttemptDto {
  @IsIn(['APPROVED', 'REJECTED'])
  decision: 'APPROVED' | 'REJECTED';

  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  reason: string;
}
