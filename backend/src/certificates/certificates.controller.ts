import { Controller, Get, Header, Param, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiCookieAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { CertificatesService } from './certificates.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Сертификаттар')
@Controller('certificates')
export class CertificatesController {
  constructor(private readonly certificatesService: CertificatesService) {}

  @Get('my')
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Менің сертификаттарым' })
  myСertificates(@CurrentUser('id') userId: string) {
    return this.certificatesService.findByUser(userId);
  }

  @Get('verify/:code')
  @Header('Cache-Control', 'no-store, max-age=0')
  @Header('Pragma', 'no-cache')
  @ApiOperation({ summary: 'Сертификатты тексеру (QR арқылы)' })
  verify(@Param('code') code: string) {
    return this.certificatesService.verify(code);
  }

  @Get(':id/pdf')
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Сертификатты PDF форматта жүктеу' })
  async downloadPdf(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Res() res: Response,
  ) {
    const buffer = await this.certificatesService.generatePdf(id, userId);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="certificate-${id}.pdf"`,
      'Content-Length': buffer.length,
      'Cache-Control': 'private, no-store',
    });
    res.end(buffer);
  }
}
