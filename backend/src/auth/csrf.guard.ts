import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { CsrfService } from './csrf.service';

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly csrf: CsrfService) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    const request = context.switchToHttp().getRequest();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase())) this.csrf.assertRequest(request);
    return true;
  }
}
