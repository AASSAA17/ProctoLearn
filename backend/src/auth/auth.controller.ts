import { Controller, Post, Body, UseGuards, Get, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiCookieAuth } from '@nestjs/swagger';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto, RefreshTokenDto, ChangePasswordDto, ForgotPasswordDto, ResetPasswordDto } from './dto/auth.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthCookies } from './auth-cookies';
import { CsrfService } from './csrf.service';

export function publicAuthUser(user: any) {
  const { id, name, email, phone, role, createdAt, lastSeen, isOnline, mustChangePassword } = user;
  return { id, name, email, phone, role, createdAt, lastSeen, isOnline, mustChangePassword };
}

@ApiTags('Аутентификация')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService, private readonly cookies: AuthCookies, private readonly csrf: CsrfService) {}

  @Get('csrf')
  csrfToken(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    return this.csrf.issue(request, response);
  }

  // 5 registrations per minute per IP
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('register')
  @ApiOperation({ summary: 'Тіркелу' })
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) response: Response) {
    const session = await this.authService.register(dto);
    this.cookies.set(response, session);
    this.csrf.rotate(response);
    return { user: publicAuthUser(session.user) };
  }

  // 10 login attempts per minute per IP
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('login')
  @ApiOperation({ summary: 'Жүйеге кіру' })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) response: Response) {
    const session = await this.authService.login(dto);
    this.cookies.set(response, session);
    this.csrf.rotate(response);
    return { user: publicAuthUser(session.user) };
  }

  @SkipThrottle()
  @Post('refresh')
  @ApiOperation({ summary: 'Токенді жаңарту' })
  async refresh(@Body() _dto: RefreshTokenDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const token = this.cookies.refreshToken(request);
    if (!token) throw new UnauthorizedException('Жарамсыз refresh token');
    const session = await this.authService.refresh(token);
    // Never clear cookies on 401: another tab may have just rotated the same refresh token.
    this.cookies.set(response, session);
    return { ok: true };
  }

  @Post('logout')
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Жүйеден шығу' })
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const result = await this.authService.logoutSession(this.cookies.accessToken(request), this.cookies.refreshToken(request));
    this.cookies.clear(response);
    this.csrf.clear(response);
    return result;
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Ағымдағы пайдаланушы' })
  me(@CurrentUser() user: any, @Res({ passthrough: true }) response: Response) {
    response.setHeader('Cache-Control', 'no-store');
    return publicAuthUser(user);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Парольды өзгерту' })
  async changePassword(@CurrentUser('id') userId: string, @Body() dto: ChangePasswordDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.authService.changePassword(userId, dto);
    this.cookies.clear(response);
    this.csrf.clear(response);
    return result;
  }

  // 3 password-reset requests per 15 minutes per IP
  @Throttle({ default: { ttl: 15 * 60_000, limit: 3 } })
  @Post('forgot-password')
  @ApiOperation({ summary: 'Пароль ұмытылды — email жіберу' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Парольды токен арқылы қалпына келтіру' })
  async resetPassword(@Body() dto: ResetPasswordDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.authService.resetPassword(dto);
    this.cookies.clear(response);
    this.csrf.clear(response);
    return result;
  }
}
