import {
  WebSocketGateway, WebSocketServer, SubscribeMessage, MessageBody, ConnectedSocket,
  OnGatewayConnection, OnGatewayDisconnect, WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ArgumentsHost, Catch, HttpException, WsExceptionFilter, UseFilters, UsePipes, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ProctorService } from './proctor.service';
import { ProctorEventLimiter, validateEventMetadata } from './proctor-event-policy';
import { ProctorEventDto, SessionDto, StartSessionDto } from './proctor.dto';
import { accessTokenFromRequest } from '../auth/auth-cookies';
import { configuredOrigins, getFrontendOrigins, isAllowedOrigin } from '../common/config/origins';

// DTO validation runs before the handler; event errors must use the UI channel.
@Catch(WsException)
class ProctorEventExceptionFilter implements WsExceptionFilter<WsException> {
  catch(exception: WsException, host: ArgumentsHost) {
    const error = exception.getError();
    host.switchToWs().getClient<Socket>().emit('proctor:error', {
      code: 'PROCTOR_EVENT_REJECTED',
      message: typeof error === 'string' ? error : 'Сұрау жарамсыз',
    });
  }
}

// Engine.IO's allowRequest also covers WebSocket upgrades; CORS alone only
// protects polling. Browser cookies must never authorize a foreign page.
function allowedHandshakeOrigin(origin: string | undefined): boolean {
  return isAllowedOrigin(origin, configuredOrigins(process.env.FRONTEND_URL, process.env.NODE_ENV === 'production'));
}

@WebSocketGateway({
  maxHttpBufferSize: 64 * 1024,
  allowRequest: (request, callback) => callback(null, allowedHandshakeOrigin(request.headers.origin)),
  cors: {
    origin: (origin: string, callback: (err: Error | null, allow?: boolean) => void) => {
      if (allowedHandshakeOrigin(origin)) return callback(null, true);
      return callback(new Error('CORS not allowed'));
    },
    credentials: true,
  },
  namespace: '/proctor',
})
@UsePipes(new ValidationPipe({
  whitelist: true, forbidNonWhitelisted: true, transform: true,
  exceptionFactory: () => new WsException('Сұрау жарамсыз'),
}))
export class ProctorGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly eventLimiter = new ProctorEventLimiter();

  constructor(
    private readonly proctorService: ProctorService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private readToken(client: Socket) {
    if (!isAllowedOrigin(client.handshake.headers.origin, getFrontendOrigins(this.configService))) throw new Error('Invalid origin');
    const token = accessTokenFromRequest(client.handshake, this.configService);
    if (typeof token !== 'string') throw new Error('Missing token');
    const payload = this.jwtService.verify(token, { secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET') });
    if (typeof payload.sub !== 'string' || typeof payload.exp !== 'number') throw new Error('Invalid subject or expiry');
    return payload;
  }

  // Revalidate expiry and the current DB role on EVERY message, not just connection.
  private async authenticate(client: Socket) {
    try {
      const payload = this.readToken(client);
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub }, select: { id: true, role: true, tokenVersion: true, mustChangePassword: true },
      });
      if (!user || user.mustChangePassword || !Number.isInteger(payload.ver) || user.tokenVersion !== payload.ver) throw new Error('Revoked session');
      if (client.data.role && client.data.role !== user.role) throw new Error('Role changed');
      client.data.role = user.role;
      client.data.userId = user.id;
      client.data.tokenVersion = user.tokenVersion;
      client.data.expiresAt = payload.exp * 1000;
      for (const [attemptId, asProctor] of Object.entries(client.data.subscriptions || {})) {
        try {
          await this.proctorService.assertSessionAccess(attemptId, user.id, user.role, Boolean(asProctor));
        } catch {
          await client.leave(`attempt:${attemptId}`);
          delete client.data.subscriptions[attemptId];
        }
      }
      if (!client.data.expiryTimer) {
        client.data.expiryTimer = setTimeout(() => {
          client.emit('proctor:error', { message: 'Сессия аяқталды', code: 'UNAUTHORIZED' });
          client.disconnect();
        }, Math.max(0, payload.exp * 1000 - Date.now()));
        client.data.expiryTimer.unref();
      }
      if (!client.data.sessionTimer) {
        client.data.sessionTimer = setInterval(() => {
          void this.authenticate(client).catch(() => this.handleDisconnect(client));
        }, 30_000);
        client.data.sessionTimer.unref();
      }
      return user;
    } catch {
      client.emit('proctor:error', { message: 'Сессия аяқталды. Қайта кіріңіз', code: 'UNAUTHORIZED' });
      client.disconnect();
      throw new WsException('Рұқсат жоқ');
    }
  }

  async handleConnection(client: Socket) {
    try { await this.authenticate(client); } catch { /* already disconnected */ }
  }

  handleDisconnect(client: Socket) {
    clearTimeout(client.data.expiryTimer);
    clearInterval(client.data.sessionTimer);
    delete client.data.expiryTimer;
    delete client.data.sessionTimer;
  }

  private async safely<T>(work: () => Promise<T>, eventClient?: Socket): Promise<T | undefined> {
    try { return await work(); } catch (error) {
      // Preserve policy codes on the event channel consumed by the exam UI.
      // Other handlers/errors retain their existing exception semantics.
      if (eventClient && error instanceof HttpException) {
        const response = error.getResponse();
        if (typeof response === 'object' && 'code' in response && 'message' in response
          && (response.code === 'PROCTOR_EVENT_LIMIT' || response.code === 'PROCTOR_METADATA_INVALID')) {
          eventClient.emit('proctor:error', { code: response.code, message: response.message });
          return;
        }
      }
      if (error instanceof WsException) throw error;
      const status = (error as { getStatus?: () => number }).getStatus?.();
      throw new WsException(status && status < 500 ? (error as Error).message : 'Сұрауды орындау мүмкін емес');
    }
  }

  // Check recipients at delivery time: revoking an assignment must also revoke
  // an already joined socket, including between the periodic session checks.
  private async emitToSession(attemptId: string, event: string, payload: unknown) {
    const sockets = await this.server.in(`attempt:${attemptId}`).fetchSockets();
    await Promise.all(sockets.map(async (socket) => {
      try {
        const user = await this.prisma.user.findUnique({ where: { id: socket.data.userId }, select: { id: true, role: true, tokenVersion: true, mustChangePassword: true } });
        if (!user || user.mustChangePassword || user.tokenVersion !== socket.data.tokenVersion || user.role !== socket.data.role || Date.now() >= socket.data.expiresAt) throw new Error('Revoked session');
        await this.proctorService.assertSessionAccess(attemptId, user.id, user.role, socket.data.subscriptions?.[attemptId] === true);
        socket.emit(event, payload);
      } catch {
        await socket.leave(`attempt:${attemptId}`);
        if (socket.data.subscriptions) delete socket.data.subscriptions[attemptId];
      }
    }));
  }

  @SubscribeMessage('proctor:start')
  async handleStart(@ConnectedSocket() client: Socket, @MessageBody() data: StartSessionDto) {
    return this.safely(async () => {
      const user = await this.authenticate(client);
      await this.proctorService.assertSessionAccess(data.attemptId, user.id, user.role, data.role === 'proctor');
      client.data.subscriptions ??= {};
      client.data.subscriptions[data.attemptId] = data.role === 'proctor';
      await client.join(`attempt:${data.attemptId}`);
      client.emit('proctor:started', data);
    });
  }

  @SubscribeMessage('proctor:event')
  @UseFilters(new ProctorEventExceptionFilter())
  async handleEvent(@ConnectedSocket() client: Socket, @MessageBody() data: ProctorEventDto) {
    return this.safely(async () => {
      // Verify the signed subject before charging its shared budget. Rejected
      // floods do not perform authentication/assignment queries or transactions.
      let subject: string;
      try { subject = this.readToken(client).sub; } catch {
        client.disconnect();
        throw new WsException('Рұқсат жоқ');
      }
      this.eventLimiter.consume(subject);
      validateEventMetadata(data.metadata);
      const user = await this.authenticate(client);
      if (user.role !== 'STUDENT') throw new WsException('Рұқсат жоқ');
      const result = await this.proctorService.recordEvent(data.attemptId, user.id, data.type, data.metadata);
      await this.emitToSession(data.attemptId, 'proctor:event:recorded', result);
    }, client);
  }

  @SubscribeMessage('proctor:end')
  async handleEnd(@ConnectedSocket() client: Socket, @MessageBody() data: SessionDto) {
    return this.safely(async () => {
      const user = await this.authenticate(client);
      const result = await this.proctorService.endSession(data.attemptId, user.id, user.role);
      await this.emitToSession(data.attemptId, 'proctor:ended', { attemptId: data.attemptId, ...result });
    });
  }
}
