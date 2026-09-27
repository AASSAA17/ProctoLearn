import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import type { Request, Response } from 'express';
import { getFrontendOrigins, isAllowedOrigin } from '../common/config/origins';
import { authCookieNames, authCookieOptions, readCookie } from './auth-cookies';

export const CSRF_TOKEN_TTL_SECONDS = 60 * 60;
export const CSRF_COOKIE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const NONCE = /^[A-Za-z0-9_-]{43}$/;

@Injectable()
export class CsrfService {
  constructor(private readonly config: ConfigService) {}

  private signature(nonce: string, expires: string) {
    return createHmac('sha256', this.config.getOrThrow<string>('JWT_ACCESS_SECRET'))
      .update(`proctolearn:csrf:v1:${nonce}:${expires}`).digest('hex');
  }

  private nonce(request: Pick<Request, 'headers'>) {
    const value = readCookie(request, authCookieNames(this.config).csrf);
    return value && NONCE.test(value) ? value : null;
  }

  rotate(response: Response) {
    const nonce = randomBytes(32).toString('base64url');
    response.cookie(authCookieNames(this.config).csrf, nonce, { ...authCookieOptions(this.config), maxAge: CSRF_COOKIE_TTL_MS });
    return nonce;
  }

  clear(response: Response) {
    response.clearCookie(authCookieNames(this.config).csrf, authCookieOptions(this.config));
  }

  issue(request: Pick<Request, 'headers'>, response: Response) {
    const origin = request.headers.origin;
    if (origin !== undefined && !isAllowedOrigin(origin, getFrontendOrigins(this.config))) this.invalidOrigin();
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');
    const nonce = this.nonce(request) ?? this.rotate(response);
    const expires = String(Math.floor(Date.now() / 1000) + CSRF_TOKEN_TTL_SECONDS);
    return { csrfToken: `v1.${expires}.${this.signature(nonce, expires)}` };
  }

  assertRequest(request: Pick<Request, 'headers'>) {
    if (!isAllowedOrigin(request.headers.origin, getFrontendOrigins(this.config))) this.invalidOrigin();
    const nonce = this.nonce(request);
    const token = request.headers['x-csrf-token'];
    const parts = typeof token === 'string' ? /^v1\.(\d{10,12})\.([a-f0-9]{64})$/.exec(token) : null;
    if (!nonce || !parts || Number(parts[1]) <= Date.now() / 1000 || Number(parts[1]) > Date.now() / 1000 + CSRF_TOKEN_TTL_SECONDS) this.invalidToken();
    const supplied = Buffer.from(parts![2], 'hex');
    const expected = Buffer.from(this.signature(nonce!, parts![1]), 'hex');
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) this.invalidToken();
  }

  private invalidOrigin(): never {
    throw new ForbiddenException({ code: 'ORIGIN_INVALID', message: 'Сұрау көзіне рұқсат берілмеген' });
  }

  private invalidToken(): never {
    throw new ForbiddenException({ code: 'CSRF_INVALID', message: 'Қорғаныс токенін жаңартып, сұрауды қайталаңыз' });
  }
}
