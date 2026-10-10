import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { getFrontendOrigins } from '../common/config/origins';

export function escapeMailHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));
}

export function passwordResetUrl(config: Pick<ConfigService, 'get'>, token: string) {
  const url = new URL('/auth/reset-password', getFrontendOrigins(config)[0]);
  url.searchParams.set('token', token);
  return url.toString();
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get('SMTP_HOST', 'smtp.gmail.com'),
      port: parseInt(this.configService.get('SMTP_PORT', '587')),
      secure: false,
      auth: this.configService.get('SMTP_USER', '') ? {
        user: this.configService.get('SMTP_USER', ''),
        pass: this.configService.get('SMTP_PASS', ''),
      } : undefined,
      connectionTimeout: 5000,
      socketTimeout: 10000,
    });
  }

  async sendTempPassword(email: string, name: string, tempPassword: string): Promise<void> {
    const subject = 'ProctoLearn — Уақытша пароль';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">ProctoLearn</h2>
        <p>Сәлем, <strong>${escapeMailHtml(name)}</strong>!</p>
        <p>Сіздің паролыңыз жаңартылды. Төмендегі уақытша паролды пайдаланыңыз:</p>
        <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <code style="font-size: 1.5rem; font-weight: bold; color: #1d4ed8;">${escapeMailHtml(tempPassword)}</code>
        </div>
        <p style="color: #dc2626;"><strong>Назар аударыңыз:</strong> Жүйеге кіргеннен кейін паролды міндетті түрде өзгертіңіз!</p>
        <hr style="border: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #6b7280; font-size: 0.875rem;">ProctoLearn жүйесі автоматты хабарламасы</p>
      </div>
    `;

    try {
      await this.transporter.sendMail({
        from: `"ProctoLearn" <${this.configService.get('SMTP_FROM') || this.configService.get('SMTP_USER') || 'noreply@proctolearn.kz'}>`,
        to: email,
        subject,
        html,
      });
      this.logger.log('Temporary password email sent');
    } catch (err) {
      this.logger.warn('Temporary password email delivery failed');
    }
  }

  async sendPasswordReset(email: string, name: string, token: string): Promise<void> {
    const resetUrl = passwordResetUrl(this.configService, token);
    const subject = 'ProctoLearn — Парольды қалпына келтіру';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">ProctoLearn</h2>
        <p>Сәлем, <strong>${escapeMailHtml(name)}</strong>!</p>
        <p>Парольды қалпына келтіру сұрауы алынды. Төмендегі сілтемені басыңыз:</p>
        <div style="margin: 24px 0;">
          <a href="${escapeMailHtml(resetUrl)}" style="background:#2563eb;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">
            Парольды қалпына келтіру
          </a>
        </div>
        <p style="color: #6b7280; font-size: 0.875rem;">Сілтеме 1 сағат бойы жарамды. Бұл өтінімді сіз жасамаған болсаңыз, хабарламаны елемеңіз.</p>
        <hr style="border: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #6b7280; font-size: 0.875rem;">ProctoLearn жүйесі автоматты хабарламасы</p>
      </div>
    `;

    try {
      await this.transporter.sendMail({
        from: `"ProctoLearn" <${this.configService.get('SMTP_FROM') || this.configService.get('SMTP_USER') || 'noreply@proctolearn.kz'}>`,
        to: email,
        subject,
        html,
      });
      this.logger.log('Password reset email sent');
    } catch (err) {
      this.logger.warn('Password reset email delivery failed');
    }
  }
}
