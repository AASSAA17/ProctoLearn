import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { v4 as uuidv4 } from 'uuid';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit') as typeof import('pdfkit');
import * as fs from 'fs';

// Font candidates: Windows paths first, then common Linux container paths
function resolveFont(...candidates: string[]): string | null {
  for (const p of candidates) if (fs.existsSync(p)) return p;
  return null;
}
const FONT_REGULAR_PATH = resolveFont(
  'C:\\Windows\\Fonts\\arial.ttf',
  '/usr/share/fonts/truetype/msttcorefonts/Arial.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
  '/usr/share/fonts/liberation/LiberationSans-Regular.ttf',
);
const FONT_BOLD_PATH = resolveFont(
  'C:\\Windows\\Fonts\\arialbd.ttf',
  '/usr/share/fonts/truetype/msttcorefonts/Arial_Bold.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
  '/usr/share/fonts/liberation/LiberationSans-Bold.ttf',
);
const FONT_ITALIC_PATH = resolveFont(
  'C:\\Windows\\Fonts\\ariali.ttf',
  '/usr/share/fonts/truetype/msttcorefonts/Arial_Italic.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Italic.ttf',
  '/usr/share/fonts/liberation/LiberationSans-Italic.ttf',
);
const FONT_SCRIPT_PATH = resolveFont(
  'C:\\Windows\\Fonts\\timesbi.ttf',
  '/usr/share/fonts/truetype/msttcorefonts/Times_New_Roman_Bold_Italic.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSerif-BoldItalic.ttf',
  '/usr/share/fonts/liberation/LiberationSerif-BoldItalic.ttf',
);
const hasFonts  = !!(FONT_REGULAR_PATH && FONT_BOLD_PATH);
const hasItalic = !!FONT_ITALIC_PATH;
const hasScript = !!FONT_SCRIPT_PATH;

@Injectable()
export class CertificatesService {
  constructor(private prisma: PrismaService) {}

  async issue(userId: string, courseId: string) {
    const existing = await this.prisma.certificate.findFirst({ where: { userId, courseId } });
    if (existing) return existing;
    const verifyCode = uuidv4();
    return this.prisma.certificate.create({ data: { userId, courseId, qrCode: verifyCode } });
  }

  async findByUser(userId: string) {
    return this.prisma.certificate.findMany({
      where: { userId },
      include: {
        course: { select: { id: true, title: true } },
        user:   { select: { id: true, name: true } },
      },
    });
  }

  async verify(qrCode: string) {
    const cert = await this.prisma.certificate.findUnique({
      where: { qrCode },
      include: {
        user:   { select: { id: true, name: true, email: true } },
        course: { select: { id: true, title: true } },
      },
    });
    if (!cert) return { valid: false };
    return { valid: true, certificate: cert };
  }

  async generatePdf(certId: string, userId: string): Promise<Buffer> {
    const cert = await this.prisma.certificate.findFirst({
      where: { id: certId, userId },
      include: {
        course: { select: { title: true } },
        user:   { select: { name: true } },
      },
    });
    if (!cert) throw new NotFoundException('Certificate not found');

    return new Promise((resolve, reject) => {
      // 7 x 5 inches  =  504 x 360 pt
      const doc = new PDFDocument({
        size: [504, 360],
        margin: 0,
        autoFirstPage: true,
        bufferPages: true,
      });
      const buffers: Buffer[] = [];
      doc.on('data',  (chunk: Buffer) => buffers.push(chunk));
      doc.on('end',   () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      if (hasFonts)  { doc.registerFont('R', FONT_REGULAR_PATH!); doc.registerFont('B', FONT_BOLD_PATH!); }
      if (hasItalic) { doc.registerFont('I', FONT_ITALIC_PATH!); }
      if (hasScript) { doc.registerFont('S', FONT_SCRIPT_PATH!); }

      const fR = hasFonts  ? 'R' : 'Helvetica';
      const fB = hasFonts  ? 'B' : 'Helvetica-Bold';
      const fI = hasItalic ? 'I' : (hasFonts ? 'R' : 'Helvetica');

      const W = 504;
      const H = 360;

      // absolute-position helper
      const t = (s: string, x: number, y: number, o: object = {}) =>
        doc.text(s, x, y, { lineBreak: false, ...o });

      // ── 1. White background ───────────────────────────────────
      doc.rect(0, 0, W, H).fill('#ffffff');

      // ── 2. Double gray border + corner squares ────────────────
      const B1 = '#9aa0a8';
      const B2 = '#c8cdd3';
      doc.rect(6,  6,  W - 12, H - 12).lineWidth(1).stroke(B1);
      doc.rect(10, 10, W - 20, H - 20).lineWidth(0.5).stroke(B2);

      const sq = 6;
      ([
        [6 - sq/2,     6 - sq/2    ],
        [W - 6 - sq/2, 6 - sq/2    ],
        [6 - sq/2,     H - 6 - sq/2],
        [W - 6 - sq/2, H - 6 - sq/2],
      ] as [number,number][]).forEach(([cx, cy]) => {
        doc.rect(cx, cy, sq, sq).lineWidth(0.8).stroke(B1);
      });

      // ── 3. Right ribbon panel ─────────────────────────────────
      const rX   = Math.round(W * 0.635);   // 320
      const rW   = W - rX - 6;              // 178
      const rTop = 6;
      const rBot = Math.round(H * 0.84);    // 302
      const rMid = rX + rW / 2;             // 409

      doc.rect(rX, rTop, rW, rBot - rTop).fill('#d8dde3');
      doc.rect(rX,           rTop, 2, rBot - rTop).fill('#c4c9d0');
      doc.rect(rX + rW - 2,  rTop, 2, rBot - rTop).fill('#c4c9d0');

      // V-point
      doc.polygon(
        [rX,      rBot],
        [rX + rW, rBot],
        [rMid,    rBot + 30],
      ).fill('#d8dde3');
      doc.moveTo(rX,      rBot).lineTo(rMid, rBot + 30).lineWidth(1).stroke('#c4c9d0');
      doc.moveTo(rX + rW, rBot).lineTo(rMid, rBot + 30).lineWidth(1).stroke('#c4c9d0');

      // ── 4. "COURSE / CERTIFICATE" heading in ribbon ───────────
      doc.fillColor('#2c3542').fontSize(9).font(fB);
      t('C O U R S E',           rX, 22, { width: rW, align: 'center', lineBreak: false });
      t('C E R T I F I C A T E', rX, 34, { width: rW, align: 'center', lineBreak: false });
      doc.moveTo(rX + 14, 48).lineTo(rX + rW - 14, 48).lineWidth(0.4).stroke('#8a9099');

      // ── 5. Circular stamp ─────────────────────────────────────
      const sc  = { x: rMid, y: 195 };
      const sr1 = 52;
      const sr2 = 46;
      const sr3 = 42;
      const sr4 = 36;
      const sr5 = 30;

      doc.circle(sc.x, sc.y, sr1).lineWidth(1).stroke('#5a6270');
      for (let i = 0; i < 60; i++) {
        const a  = (i / 60) * Math.PI * 2;
        const px = sc.x + sr2 * Math.cos(a);
        const py = sc.y + sr2 * Math.sin(a);
        doc.circle(px, py, 0.85).fill('#5a6270');
      }
      doc.circle(sc.x, sc.y, sr3).lineWidth(0.7).stroke('#5a6270');
      doc.circle(sc.x, sc.y, sr4).lineWidth(0.4).stroke('#8a9099');
      doc.circle(sc.x, sc.y, sr5).lineWidth(0.7).stroke('#5a6270');

      // arc text top
      const arcTopText = 'EDUCATION FOR EVERYONE';
      const arcR = sr1 - 6;
      {
        const chars = arcTopText.split('');
        const span  = Math.PI * 0.88;
        const start = -Math.PI / 2 - span / 2;
        const step  = span / Math.max(chars.length - 1, 1);
        doc.fillColor('#3a4250').fontSize(5).font(fB);
        chars.forEach((ch, i) => {
          const angle = start + i * step;
          const lx = sc.x + arcR * Math.cos(angle);
          const ly = sc.y + arcR * Math.sin(angle);
          doc.save();
          doc.translate(lx, ly);
          doc.rotate((angle + Math.PI / 2) * (180 / Math.PI));
          doc.text(ch, -2, -3, { lineBreak: false });
          doc.restore();
        });
      }

      // arc text bottom
      const arcBotText = 'COURSE  CERTIFICATE';
      {
        const chars = arcBotText.split('');
        const span  = Math.PI * 0.78;
        const start = Math.PI / 2 - span / 2;
        const step  = span / Math.max(chars.length - 1, 1);
        doc.fillColor('#3a4250').fontSize(5).font(fB);
        chars.forEach((ch, i) => {
          const angle = start + i * step;
          const lx = sc.x + arcR * Math.cos(angle);
          const ly = sc.y + arcR * Math.sin(angle);
          doc.save();
          doc.translate(lx, ly);
          doc.rotate((angle - Math.PI / 2) * (180 / Math.PI));
          doc.text(ch, -2, -3, { lineBreak: false });
          doc.restore();
        });
      }

      doc.circle(sc.x - arcR - 1, sc.y, 1.5).fill('#5a6270');
      doc.circle(sc.x + arcR + 1, sc.y, 1.5).fill('#5a6270');

      // center logo in stamp
      doc.fillColor('#0056d2').fontSize(7.5).font(fB);
      t('ProctoLearn', sc.x - 28, sc.y - 5, { lineBreak: false });

      // ── 6. Left panel ─────────────────────────────────────────
      const lPad = 26;
      const lW   = rX - lPad - 10;

      // faint topographic lines
      doc.save();
      doc.opacity(0.055);
      doc.strokeColor('#c8a060').lineWidth(0.6);
      for (let i = 0; i < 12; i++) {
        const oy  = 80 + i * 22;
        const amp = 7 + i * 1.5;
        doc.moveTo(lPad - 6, oy)
           .bezierCurveTo(lPad + 40,  oy - amp,    lPad + 90,  oy + amp * 0.8, lPad + 140, oy - amp * 0.5)
           .bezierCurveTo(lPad + 190, oy + amp,    lPad + 240, oy - amp * 0.5, rX + 6,     oy + amp * 0.3)
           .stroke();
      }
      doc.restore();

      // ── Logo ──────────────────────────────────────────────────
      doc.fillColor('#0056d2').fontSize(32).font(fB);
      t('ProctoLearn', lPad, 18);

      // ── Date ──────────────────────────────────────────────────
      const issued = new Date(cert.issuedAt).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      }).toUpperCase();
      doc.fillColor('#5f6368').fontSize(7).font(fR);
      t(issued, lPad, 74);

      // ── Recipient name ────────────────────────────────────────
      doc.fillColor('#1f2937').fontSize(22).font(fB);
      doc.text(cert.user.name, lPad, 86, { width: lW, lineBreak: true });
      const afterName = doc.y + 8;

      // ── "has successfully completed" ────────────────────────────
      doc.fillColor('#6b7280').fontSize(7.5).font(fI);
      t('has successfully completed the course', lPad, afterName);

      // thin separator
      doc.moveTo(lPad, afterName + 15)
         .lineTo(lPad + lW * 0.5, afterName + 15)
         .lineWidth(0.3).stroke('#e5e7eb');

      // ── Course title ──────────────────────────────────────────
      doc.fillColor('#1f2937').fontSize(10).font(fB);
      doc.text(cert.course.title, lPad, afterName + 22, { width: lW, lineBreak: true });
      const afterCourse = doc.y + 4;

      // ── Description ───────────────────────────────────────────
      doc.fillColor('#6b7280').fontSize(7).font(fR);
      doc.text(
        'Online certificate for the course organized and offered by ProctoLearn online learning platform',
        lPad, afterCourse, { width: lW * 0.82, lineBreak: true }
      );

      // ── Signature ─────────────────────────────────────────────
      const sigY = H - 105;
      doc.save();
      doc.strokeColor('#1a1a1a').lineWidth(0.9);
      doc.moveTo(lPad,       sigY + 14)
         .bezierCurveTo(lPad + 5,   sigY,      lPad + 11,  sigY + 20, lPad + 18,  sigY + 10)
         .bezierCurveTo(lPad + 25,  sigY + 1,  lPad + 31,  sigY + 18, lPad + 40,  sigY + 8)
         .bezierCurveTo(lPad + 49,  sigY - 1,  lPad + 57,  sigY + 16, lPad + 66,  sigY + 6)
         .bezierCurveTo(lPad + 75,  sigY - 2,  lPad + 84,  sigY + 14, lPad + 94,  sigY + 8)
         .bezierCurveTo(lPad + 102, sigY - 1,  lPad + 110, sigY + 12, lPad + 118, sigY + 8)
         .stroke();
      doc.moveTo(lPad + 55, sigY + 8)
         .bezierCurveTo(lPad + 62, sigY + 26, lPad + 76, sigY + 30, lPad + 88, sigY + 22)
         .stroke();
      doc.restore();

      doc.moveTo(lPad, sigY + 36).lineTo(lPad + 130, sigY + 36).lineWidth(0.5).stroke('#9ca3af');

      doc.fillColor('#374151').fontSize(7).font(fB);
      t('ProctoLearn Project', lPad, sigY + 42);
      doc.fillColor('#6b7280').fontSize(6.5).font(fR);
      t('Director of Online Learning Platform', lPad, sigY + 53);
      t('ProctoLearn Certificate Program', lPad, sigY + 63);

      // ── Verify URL ────────────────────────────────────────────
      const frontendBase = (process.env.FRONTEND_URL || 'http://localhost:3000').split(',')[0].trim();
      const verifyUrl = `${frontendBase}/verify/${cert.qrCode}`;
      const vx = rX - 10;
      const vy = H - 42;
      doc.fillColor('#374151').fontSize(6).font(fR);
      t('Verification URL:', vx, vy, { width: 160, align: 'right', lineBreak: false });
      doc.fillColor('#1a73e8').fontSize(6).font(fR);
      t(verifyUrl, vx, vy + 10, { width: 160, align: 'right', lineBreak: false });
      doc.fillColor('#6b7280').fontSize(6).font(fR);
      doc.text(
        'ProctoLearn has verified the identity and course participation of this individual.',
        vx - 150, vy + 20,
        { width: 160, align: 'right', lineBreak: true }
      );

      doc.flushPages();
      doc.end();
    });
  }
}