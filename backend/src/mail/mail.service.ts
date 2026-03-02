import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get('SMTP_HOST', 'smtp.gmail.com'),
      port: parseInt(this.configService.get('SMTP_PORT', '587')),
      secure: false,
      auth: {
        user: this.configService.get('SMTP_USER', ''),
        pass: this.configService.get('SMTP_PASS', ''),
      },
    });
  }

  async sendTempPassword(email: string, name: string, tempPassword: string): Promise<void> {
    const subject = 'ProctoLearn — Уақытша пароль';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">ProctoLearn</h2>
        <p>Сәлем, <strong>${name}</strong>!</p>
        <p>Сіздің паролыңыз жаңартылды. Төмендегі уақытша паролды пайдаланыңыз:</p>
        <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <code style="font-size: 1.5rem; font-weight: bold; color: #1d4ed8;">${tempPassword}</code>
        </div>
        <p style="color: #dc2626;"><strong>Назар аударыңыз:</strong> Жүйеге кіргеннен кейін паролды міндетті түрде өзгертіңіз!</p>
        <hr style="border: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #6b7280; font-size: 0.875rem;">ProctoLearn жүйесі автоматты хабарламасы</p>
      </div>
    `;

    try {
      await this.transporter.sendMail({
        from: `"ProctoLearn" <${this.configService.get('SMTP_USER', 'noreply@proctolearn.kz')}>`,
        to: email,
        subject,
        html,
      });
      this.logger.log(`Уақытша пароль жіберілді: ${email}`);
    } catch (err) {
      this.logger.warn(`Email жіберу сәтсіз болды (${email}): ${err.message}`);
      // Don't throw — just log, admin will see temp password in response
    }
  }
}
