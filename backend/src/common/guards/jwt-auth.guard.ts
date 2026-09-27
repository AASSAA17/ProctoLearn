import { ConflictException, ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = any>(error: any, user: any, info: any, context: ExecutionContext, status?: any): TUser {
    const authenticated = super.handleRequest(error, user, info, context, status);
    const expected = context.switchToHttp().getRequest().headers['x-session-user'];
    // A background tab can miss the account-change broadcast. Bind its original request
    // to the verified principal so a retry cannot execute under the replacement cookies.
    if (expected !== undefined && (typeof expected !== 'string' || expected !== authenticated.id)) {
      throw new ConflictException({ code: 'AUTH_CHANGED', message: 'Аккаунт өзгерді. Бетті жаңартыңыз.' });
    }
    return authenticated;
  }
}
