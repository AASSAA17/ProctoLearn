import {
  WebSocketGateway, WebSocketServer, SubscribeMessage, MessageBody, ConnectedSocket,
  OnGatewayConnection, OnGatewayDisconnect, WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UsePipes, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ProctorService } from './proctor.service';
import { ProctorEventDto, SessionDto, StartSessionDto } from './proctor.dto';

@WebSocketGateway({
  maxHttpBufferSize: 64 * 1024,
  cors: {
    origin: (origin: string, callback: (err: Error | null, allow?: boolean) => void) => {
      const allowed = (process.env.FRONTEND_URL || 'http://localhost:3000').split(',').map((s) => s.trim());
      if (process.env.NODE_ENV !== 'production') allowed.push('http://localhost:3000', 'http://localhost:3001');
      if (!origin || allowed.includes(origin)) return callback(null, true);
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

  constructor(
    private readonly proctorService: ProctorService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  // Revalidate expiry and the current DB role on EVERY message, not just connection.
  private async authenticate(client: Socket) {
    try {
      const token = client.handshake.auth?.token;
      if (typeof token !== 'string') throw new Error('Missing token');
      const payload = this.jwtService.verify(token, {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
      if (typeof payload.sub !== 'string' || typeof payload.exp !== 'number') throw new Error('Invalid subject or expiry');
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub }, select: { id: true, role: true, tokenVersion: true },
      });
      if (!user || !Number.isInteger(payload.ver) || user.tokenVersion !== payload.ver) throw new Error('Revoked session');
      if (client.data.role && client.data.role !== user.role) throw new Error('Role changed');
      client.data.role = user.role;
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

  private async safely<T>(work: () => Promise<T>): Promise<T> {
    try { return await work(); } catch (error) {
      if (error instanceof WsException) throw error;
      const status = (error as { getStatus?: () => number }).getStatus?.();
      throw new WsException(status && status < 500 ? (error as Error).message : 'Сұрауды орындау мүмкін емес');
    }
  }

  @SubscribeMessage('proctor:start')
  async handleStart(@ConnectedSocket() client: Socket, @MessageBody() data: StartSessionDto) {
    return this.safely(async () => {
      const user = await this.authenticate(client);
      await this.proctorService.assertSessionAccess(data.attemptId, user.id, user.role, data.role === 'proctor');
      await client.join(`attempt:${data.attemptId}`);
      client.emit('proctor:started', data);
    });
  }

  @SubscribeMessage('proctor:event')
  async handleEvent(@ConnectedSocket() client: Socket, @MessageBody() data: ProctorEventDto) {
    return this.safely(async () => {
      const user = await this.authenticate(client);
      if (user.role !== 'STUDENT') throw new WsException('Рұқсат жоқ');
      const result = await this.proctorService.recordEvent(data.attemptId, user.id, data.type, data.metadata);
      this.server.to(`attempt:${data.attemptId}`).emit('proctor:event:recorded', result);
    });
  }

  @SubscribeMessage('proctor:end')
  async handleEnd(@ConnectedSocket() client: Socket, @MessageBody() data: SessionDto) {
    return this.safely(async () => {
      const user = await this.authenticate(client);
      const result = await this.proctorService.endSession(data.attemptId, user.id, user.role);
      this.server.to(`attempt:${data.attemptId}`).emit('proctor:ended', { attemptId: data.attemptId, ...result });
    });
  }
}
