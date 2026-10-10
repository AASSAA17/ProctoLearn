import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type PilotSettings = {
  enabled: boolean;
  maxParticipants: number;
  defaultCourseSeats: number;
  publicSignup: false;
};

function booleanValue(value: unknown, key: string, fallback: boolean): boolean {
  if (value === undefined || value === null || value === '') return fallback;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  throw new Error(`${key} must be true or false`);
}

function integerValue(value: unknown, key: string, fallback: number, max: number): number {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) throw new Error(`${key} must be an integer from 1 to ${max}`);
  return parsed;
}

export function pilotSettings(source: { get(key: string): unknown }): PilotSettings {
  const enabled = booleanValue(source.get('PILOT_MODE'), 'PILOT_MODE', false);
  const publicSignup = booleanValue(source.get('PILOT_PUBLIC_SIGNUP'), 'PILOT_PUBLIC_SIGNUP', false);
  if (enabled && publicSignup) throw new Error('PILOT_PUBLIC_SIGNUP must be false when PILOT_MODE is enabled');
  return {
    enabled,
    maxParticipants: integerValue(source.get('PILOT_MAX_PARTICIPANTS'), 'PILOT_MAX_PARTICIPANTS', 10, 100),
    defaultCourseSeats: integerValue(source.get('PILOT_DEFAULT_COURSE_SEATS'), 'PILOT_DEFAULT_COURSE_SEATS', 10, 1000),
    publicSignup: false,
  };
}

export function validatePilotEnvironment(env: Record<string, unknown>): void {
  pilotSettings({ get: (key: string) => env[key] });
}

@Injectable()
export class PilotPolicy {
  readonly settings: PilotSettings;

  constructor(config: ConfigService) {
    this.settings = pilotSettings(config);
  }

  requireEnabled(): PilotSettings {
    if (!this.settings.enabled) throw new BadRequestException({ code: 'PILOT_DISABLED', message: 'Пилоттық режим қосылмаған' });
    return this.settings;
  }
}
