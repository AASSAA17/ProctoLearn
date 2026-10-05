import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto, LoginDto, ChangePasswordDto, ForgotPasswordDto, ResetPasswordDto } from './dto/auth.dto';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { MailService } from '../mail/mail.service';
import { tokenDigest } from './token-digest';
import { serializable } from '../prisma/serializable';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private mailService: MailService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase().trim();
    const exists = await this.prisma.user.findUnique({
      where: { email },
    });

    if (exists) {
      throw new ConflictException('Бұл email тіркелген');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        email,
        phone: dto.phone?.trim() || null,
        password: hashedPassword,
      },
      select: { id: true, name: true, email: true, phone: true, role: true, createdAt: true, mustChangePassword: true, tokenVersion: true },
    });

    const tokens = await this.generateTokens(user.id, user.email, user.role, user.tokenVersion);
    await this.saveRefreshToken(user.id, tokens.refreshToken, user.tokenVersion);

    return { user, ...tokens };
  }

  async login(dto: LoginDto) {
    const email = dto.email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException('Email немесе пароль қате');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Email немесе пароль қате');
    }

    const tokens = await this.generateTokens(user.id, user.email, user.role, user.tokenVersion);
    await this.saveRefreshToken(user.id, tokens.refreshToken, user.tokenVersion);

    const { password, refreshToken, ...userWithoutSecrets } = user;
    return { user: userWithoutSecrets, ...tokens };
  }

  async refresh(token: string) {
    let payload: any;
    try {
      payload = this.jwtService.verify(token, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Жарамсыз refresh token');
    }
    if (typeof payload.sub !== 'string' || !Number.isInteger(payload.ver) || typeof payload.jti !== 'string') {
      throw new UnauthorizedException();
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.refreshToken || payload.ver !== user.tokenVersion) {
      throw new UnauthorizedException('Жарамсыз refresh token');
    }

    const digest = tokenDigest(token);
    if (digest !== user.refreshToken) throw new UnauthorizedException('Жарамсыз refresh token');

    const tokens = await this.generateTokens(user.id, user.email, user.role, user.tokenVersion);
    // One use only, including concurrent refreshes and concurrent session revocation.
    const rotated = await this.prisma.user.updateMany({
      where: { id: user.id, refreshToken: digest, tokenVersion: user.tokenVersion },
      data: { refreshToken: tokenDigest(tokens.refreshToken) },
    });
    if (rotated.count !== 1) throw new UnauthorizedException();

    return tokens;
  }

  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null, tokenVersion: { increment: 1 }, isOnline: false },
    });
    return { message: 'Сәтті шықтыңыз' };
  }

  /** Explicit logout can clear expired cookies, but revocation always requires a verified identity. */
  async logoutSession(accessToken: string | null, refreshToken: string | null) {
    for (const candidate of [
      { token: accessToken, key: 'JWT_ACCESS_SECRET', refresh: false },
      { token: refreshToken, key: 'JWT_REFRESH_SECRET', refresh: true },
    ]) {
      if (!candidate.token) continue;
      let payload: any;
      try { payload = this.jwtService.verify(candidate.token, { secret: this.configService.getOrThrow<string>(candidate.key) }); }
      catch { continue; }
      if (typeof payload.sub !== 'string' || !Number.isInteger(payload.ver)) continue;
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || user.tokenVersion !== payload.ver || (candidate.refresh && user.refreshToken !== tokenDigest(candidate.token))) continue;
      await this.prisma.user.updateMany({
        // Once identity is verified, a concurrent refresh must not prevent session revocation.
        where: { id: user.id, tokenVersion: user.tokenVersion },
        data: { refreshToken: null, tokenVersion: { increment: 1 }, isOnline: false },
      });
      break;
    }
    return { message: 'Сәтті шықтыңыз' };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    const valid = await bcrypt.compare(dto.currentPassword, user.password);
    if (!valid) throw new BadRequestException('Ағымдағы пароль қате');

    const hashed = await bcrypt.hash(dto.newPassword, 12);
    await serializable(this.prisma, async (tx) => {
      const changed = await tx.user.updateMany({
        where: { id: userId, password: user.password, tokenVersion: user.tokenVersion },
        data: { password: hashed, mustChangePassword: false, refreshToken: null, tokenVersion: { increment: 1 } },
      });
      if (changed.count !== 1) throw new UnauthorizedException();
      await tx.passwordResetToken.deleteMany({ where: { userId } });
    });
    return { message: 'Пароль сәтті өзгертілді' };
  }

  private async generateTokens(userId: string, email: string, role: string, version: number) {
    const payload = { sub: userId, email, role, ver: version };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.configService.get('JWT_ACCESS_EXPIRES_IN', '15m'),
      }),
      this.jwtService.signAsync({ ...payload, jti: crypto.randomUUID() }, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get('JWT_REFRESH_EXPIRES_IN', '7d'),
      }),
    ]);

    return { accessToken, refreshToken };
  }

  private async saveRefreshToken(userId: string, refreshToken: string, version: number) {
    const saved = await this.prisma.user.updateMany({
      where: { id: userId, tokenVersion: version },
      data: { refreshToken: tokenDigest(refreshToken) },
    });
    if (saved.count !== 1) throw new UnauthorizedException();
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase().trim() } });
    // Don't reveal whether user exists
    if (!user) return { message: 'Егер email тіркелген болса, нұсқаулық жіберілді' };

    // Delete any existing tokens for this user
    await this.prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.prisma.passwordResetToken.create({
      data: { token: tokenDigest(token), userId: user.id, expiresAt },
    });

    await this.mailService.sendPasswordReset(user.email, user.name, token);

    return { message: 'Егер email тіркелген болса, нұсқаулық жіберілді' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const token = tokenDigest(dto.token);
    // Reject invalid links before spending CPU on bcrypt. The transaction below
    // revalidates expiry and single-use state after hashing (and on retries).
    const candidate = await this.prisma.passwordResetToken.findUnique({ where: { token } });
    if (!candidate || candidate.expiresAt <= new Date()) {
      throw new BadRequestException('Сілтеме жарамсыз немесе мерзімі өткен');
    }
    const hashed = await bcrypt.hash(dto.newPassword, 12);
    await serializable(this.prisma, async (tx) => {
      const record = await tx.passwordResetToken.findUnique({ where: { token } });
      if (!record || record.expiresAt <= new Date()) {
        throw new BadRequestException('Сілтеме жарамсыз немесе мерзімі өткен');
      }
      await tx.user.update({
        where: { id: record.userId },
        data: { password: hashed, mustChangePassword: false, refreshToken: null, tokenVersion: { increment: 1 } },
      });
      await tx.passwordResetToken.deleteMany({ where: { userId: record.userId } });
    });

    return { message: 'Пароль сәтті өзгертілді' };
  }
}
