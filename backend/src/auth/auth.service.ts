import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto, LoginDto, ChangePasswordDto } from './dto/auth.dto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const exists = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (exists) {
      throw new ConflictException('Бұл email тіркелген');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        password: hashedPassword,
      },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    await this.saveRefreshToken(user.id, tokens.refreshToken);

    return { user, ...tokens };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Email немесе пароль қате');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Email немесе пароль қате');
    }

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    await this.saveRefreshToken(user.id, tokens.refreshToken);

    const { password, refreshToken, ...userWithoutSecrets } = user;
    return { user: userWithoutSecrets, ...tokens };
  }

  async refresh(token: string) {
    try {
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get('JWT_REFRESH_SECRET', 'refresh_secret'),
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user || user.refreshToken !== token) {
        throw new UnauthorizedException('Жарамсыз refresh token');
      }

      const tokens = await this.generateTokens(user.id, user.email, user.role);
      await this.saveRefreshToken(user.id, tokens.refreshToken);

      return tokens;
    } catch {
      throw new UnauthorizedException('Жарамсыз refresh token');
    }
  }

  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    });
    return { message: 'Сәтті шықтыңыз' };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    const valid = await bcrypt.compare(dto.currentPassword, user.password);
    if (!valid) throw new BadRequestException('Ағымдағы пароль қате');

    const hashed = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashed, mustChangePassword: false },
    });
    return { message: 'Пароль сәтті өзгертілді' };
  }

  private async generateTokens(userId: string, email: string, role: string) {
    const payload = { sub: userId, email, role };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get('JWT_ACCESS_SECRET', 'access_secret'),
        expiresIn: this.configService.get('JWT_ACCESS_EXPIRES_IN', '15m'),
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get('JWT_REFRESH_SECRET', 'refresh_secret'),
        expiresIn: this.configService.get('JWT_REFRESH_EXPIRES_IN', '7d'),
      }),
    ]);

    return { accessToken, refreshToken };
  }

  private async saveRefreshToken(userId: string, refreshToken: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken },
    });
  }
}
