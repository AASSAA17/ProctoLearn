import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ActivityInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'http') return next.handle();

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (user?.id) {
      // Fire-and-forget: update lastSeen (isOnline is computed dynamically from lastSeen in queries)
      this.prisma.user
        .update({
          where: { id: user.id },
          data: { lastSeen: new Date() },
        })
        .catch(() => {});
    }

    return next.handle();
  }
}
