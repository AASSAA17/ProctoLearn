import * as path from 'path';
import * as fs from 'fs';
import * as QRCode from 'qrcode';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit') as typeof import('pdfkit');
import { certificateOrigin } from '../common/config/certificate-origin';

type PrintedCertificate = { qrCode: string; issuedAt: Date; status: string; issuedVia: string;
  recipientName: string | null; courseTitle: string | null; issuerName: string | null; snapshotStatus: string };

export async function renderCertificatePdf(cert: PrintedCertificate): Promise<Buffer> {
  const verifyUrl = `${certificateOrigin()}/verify/${encodeURIComponent(cert.qrCode)}`;
  const qr = await QRCode.toBuffer(verifyUrl, { errorCorrectionLevel: 'M', margin: 4, width: 480 });
  const fontDir = [path.resolve(__dirname, '../../assets/fonts'), path.resolve(__dirname, '../../../assets/fonts')]
    .find((dir) => fs.existsSync(path.join(dir, 'Inter-Regular.ttf')));
  if (!fontDir) throw new Error('Bundled certificate fonts are missing');
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
    doc.registerFont('Regular', path.join(fontDir, 'Inter-Regular.ttf'));
    doc.registerFont('Bold', path.join(fontDir, 'Inter-Bold.ttf'));
    doc.rect(0, 0, 842, 596).fill('#f6f7fb');
    doc.rect(24, 24, 794, 548).fillAndStroke('#ffffff', '#d9deec');
    doc.rect(24, 24, 8, 548).fill('#6554d9');
    doc.font('Bold').fontSize(18).fillColor('#6554d9').text('ProctoLearn', 58, 54);
    doc.fontSize(30).fillColor('#17243b').text('СЕРТИФИКАТ', 58, 96);
    doc.font('Regular').fontSize(11).fillColor('#506079').text('Курс туралы құжат / Свидетельство о курсе', 58, 138);
    const fit = (text: string, y: number, height: number, max: number) => {
      doc.font('Bold'); let size = max;
      while (size > 8) { doc.fontSize(size); if (doc.heightOfString(text, { width: 555 }) <= height) break; size -= 0.5; }
      doc.fillColor('#17243b').text(text, 58, y, { width: 555, height, ellipsis: true });
    };
    doc.font('Regular').fontSize(10).fillColor('#506079').text('Алушы / Получатель', 58, 180);
    fit(cert.recipientName ?? 'Тарихи аты-жөні сақталмаған', 200, 76, 27);
    doc.font('Regular').fontSize(10).fillColor('#506079').text('Курс', 58, 290);
    fit(cert.courseTitle ?? 'Тарихи курс атауы сақталмаған', 310, 100, 22);
    doc.font('Regular').fontSize(10).fillColor('#506079');
    const source = cert.issuedVia === 'PROCTORED_EXAM' ? 'Емтихан және проктор тексеруі' : cert.issuedVia === 'ADMIN_OVERRIDE' ? 'Әкімші шешімі' : 'Бұрын берілген құжат';
    doc.text(`Негізі: ${source}`, 58, 430, { width: 555 });
    doc.text(`Берілді: ${new Date(cert.issuedAt).toISOString().slice(0, 10)}  •  ${cert.issuerName ?? 'Тарихи ұйым атауы сақталмаған'}`, 58, 451, { width: 555 });
    doc.font('Bold').fillColor(cert.status === 'REVOKED' ? '#aa283e' : '#17243b').text(cert.status === 'REVOKED' ? 'КҮШІ ЖОЙЫЛҒАН / ОТОЗВАН' : 'Мәртебесін QR арқылы тексеріңіз', 58, 476, { width: 550 });
    doc.image(qr, 632, 181, { width: 156, height: 156 });
    doc.font('Regular').fontSize(9).fillColor('#506079').text('Тексеру / Проверка', 632, 348, { width: 156, align: 'center' });
    doc.fontSize(7).fillColor('#6554d9').text(verifyUrl, 631, 370, { width: 158, link: verifyUrl, align: 'center' });
    doc.fontSize(8).fillColor('#506079').text(cert.snapshotStatus === 'CAPTURED'
      ? 'Деректер берілген сәтте сақталған. QR құжатты ұсынған адамның жеке басын растамайды.'
      : 'LEGACY: берілген сәттегі деректер сақталмаған. Ағымдағы профиль тарихи дерек ретінде қолданылмайды.',
      58, 523, { width: 726 });
    doc.end();
  });
}
