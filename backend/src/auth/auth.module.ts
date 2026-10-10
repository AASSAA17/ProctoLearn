import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { MailModule } from '../mail/mail.module';
import { AuthCookies } from './auth-cookies';
import { CsrfService } from './csrf.service';
import { CsrfGuard } from './csrf.guard';
import { PilotModule } from '../pilot/pilot.module';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({}),
    MailModule,
    PilotModule,
  ],
  providers: [AuthService, JwtStrategy, AuthCookies, CsrfService, CsrfGuard],
  controllers: [AuthController],
  exports: [AuthService, AuthCookies, CsrfService, CsrfGuard],
})
export class AuthModule {}
