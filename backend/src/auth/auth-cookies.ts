import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';

type CookieRequest = Pick<Request, 'headers'>;

export function authCookieNames(config: Pick<ConfigService, 'get'>) {
  const prefix = config.get('NODE_ENV') === 'production' ? '__Host-pl-' : 'pl-';
  return { access: `${prefix}access`, refresh: `${prefix}refresh`, csrf: `${prefix}csrf` };
}

/** Duplicate cookie names fail closed instead of choosing an attacker-controlled path cookie. */
export function readCookie(request: CookieRequest, name: string): string | null {
  const header = request.headers?.cookie;
  if (typeof header !== 'string' || header.length > 16_384) return null;
  const matches = header.split(';').map((value) => value.trim()).filter((value) => value.slice(0, value.indexOf('=')) === name);
  if (matches.length !== 1) return null;
  try { return decodeURIComponent(matches[0].slice(name.length + 1)) || null; }
  catch { return null; }
}

export function accessTokenFromRequest(request: CookieRequest, config: Pick<ConfigService, 'get'>) {
  return readCookie(request, authCookieNames(config).access);
}

export function authCookieOptions(config: Pick<ConfigService, 'get'>): CookieOptions {
  return { httpOnly: true, secure: config.get('NODE_ENV') === 'production', sameSite: 'lax', path: '/' };
}

function tokenMaxAge(token: string): number {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    if (!Number.isSafeInteger(payload.exp) || payload.exp <= Date.now() / 1000) throw new Error();
    return Math.max(0, payload.exp * 1000 - Date.now());
  } catch { throw new InternalServerErrorException('Cannot establish the session'); }
}

@Injectable()
export class AuthCookies {
  constructor(private readonly config: ConfigService) {}

  set(response: Response, tokens: { accessToken: string; refreshToken: string }) {
    const names = authCookieNames(this.config);
    const options = authCookieOptions(this.config);
    const accessMaxAge = tokenMaxAge(tokens.accessToken);
    const refreshMaxAge = tokenMaxAge(tokens.refreshToken);
    response.cookie(names.access, tokens.accessToken, { ...options, maxAge: accessMaxAge });
    response.cookie(names.refresh, tokens.refreshToken, { ...options, maxAge: refreshMaxAge });
    response.setHeader('Cache-Control', 'no-store');
  }

  refreshToken(request: CookieRequest): string | null {
    return readCookie(request, authCookieNames(this.config).refresh);
  }

  accessToken(request: CookieRequest): string | null {
    return accessTokenFromRequest(request, this.config);
  }

  clear(response: Response) {
    const names = authCookieNames(this.config);
    const options = authCookieOptions(this.config);
    response.clearCookie(names.access, options);
    response.clearCookie(names.refresh, options);
    response.setHeader('Cache-Control', 'no-store');
  }
}
