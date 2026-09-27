import { BadRequestException, CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { RecordingUploadsService } from './recording-uploads.service';
import { CHUNK_COUNT_LIMIT } from './recording-upload-policy';

/** Authorize before Multer consumes body bytes or creates a temporary file. */
@Injectable()
export class RecordingUploadOwnerGuard implements CanActivate {
  constructor(private readonly uploads: RecordingUploadsService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const index = request.params.index;
    if (!/^\d{1,4}$/.test(index) || Number(index) >= CHUNK_COUNT_LIMIT) throw new BadRequestException('Бөлік нөмірі жарамсыз');
    await this.uploads.assertWritableUpload(request.params.id, request.user.id);
    return true;
  }
}
