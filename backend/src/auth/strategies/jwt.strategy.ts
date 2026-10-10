import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { accessTokenFromRequest } from '../auth-cookies';
import { pilotSettings } from '../../pilot/pilot-policy';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: (request) => accessTokenFromRequest(request, configService),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: { sub: string; email: string; role: string; ver: number }) {
    if (typeof payload.sub !== 'string' || !Number.isInteger(payload.ver)) throw new UnauthorizedException();
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, name: true, email: true, role: true, mustChangePassword: true, tokenVersion: true },
    });

    if (!user || user.tokenVersion !== payload.ver) {
      throw new UnauthorizedException('Пайдаланушы табылмады');
    }

    if (pilotSettings(this.configService).enabled && user.role === 'STUDENT') {
      const membership = await this.prisma.pilotMembership.findUnique({ where: { userId: user.id }, select: { status: true } });
      if (!membership || membership.status !== 'ACTIVE') {
        throw new UnauthorizedException({ code: 'PILOT_ACCESS_DENIED', message: 'Пилотқа кіруге рұқсат жоқ немесе рұқсат тоқтатылған' });
      }
    }

    // Track online status (fire-and-forget)
    this.prisma.user.update({
      where: { id: payload.sub },
      data: { lastSeen: new Date(), isOnline: true },
    }).catch(() => {});

    return user;
  }
}
