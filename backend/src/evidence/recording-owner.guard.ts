import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { EvidenceService } from './evidence.service';

/** Runs before Multer accepts the uploaded file. */
@Injectable()
export class RecordingOwnerGuard implements CanActivate {
  constructor(private readonly evidence: EvidenceService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    await this.evidence.assertOwner(request.params.attemptId, request.user.id);
    return true;
  }
}
