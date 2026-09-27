import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
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

    // Track online status (fire-and-forget)
    this.prisma.user.update({
      where: { id: payload.sub },
      data: { lastSeen: new Date(), isOnline: true },
    }).catch(() => {});

    return user;
  }
}
