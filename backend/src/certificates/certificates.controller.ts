import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CertificatesService } from './certificates.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Сертификаттар')
@Controller('certificates')
export class CertificatesController {
  constructor(private readonly certificatesService: CertificatesService) {}

  @Get('my')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Менің сертификаттарым' })
  myСertificates(@CurrentUser('id') userId: string) {
    return this.certificatesService.findByUser(userId);
  }

  @Get('verify/:code')
  @ApiOperation({ summary: 'Сертификатты тексеру (QR арқылы)' })
  verify(@Param('code') code: string) {
    return this.certificatesService.verify(code);
  }
}
