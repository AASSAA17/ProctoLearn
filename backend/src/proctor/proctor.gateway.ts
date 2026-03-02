import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ProctorService } from './proctor.service';

const TRUST_SCORE_DEDUCTIONS: Record<string, number> = {
  tab_switch: 10,
  copy_paste: 15,
  fullscreen_exit: 5,
  face_not_detected: 20,
  paste: 15,
};

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/proctor',
})
export class ProctorGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ProctorGateway.name);

  // Map: attemptId -> Set of proctor socketIds
  private proctorRooms = new Map<string, Set<string>>();

  constructor(
    private readonly proctorService: ProctorService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token as string;
      if (!token) {
        this.logger.warn(`Client ${client.id} rejected: no token`);
        client.disconnect();
        return;
      }
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get('JWT_ACCESS_SECRET', 'access_secret'),
      });
      client.data.userId = payload.sub;
      client.data.role = payload.role;
      this.logger.log(`Client connected: ${client.id} (user: ${payload.sub})`);
    } catch {
      this.logger.warn(`Client ${client.id} rejected: invalid token`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('proctor:start')
  async handleStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { attemptId: string; role: 'student' | 'proctor' },
  ) {
    const { attemptId, role } = data;
    client.join(`attempt:${attemptId}`);

    if (role === 'proctor') {
      if (!this.proctorRooms.has(attemptId)) {
        this.proctorRooms.set(attemptId, new Set());
      }
      this.proctorRooms.get(attemptId).add(client.id);
    }

    this.logger.log(`${role} joined attempt room: ${attemptId}`);
    client.emit('proctor:started', { attemptId, role });
  }

  @SubscribeMessage('proctor:event')
  async handleEvent(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { attemptId: string; type: string; metadata?: Record<string, any> },
  ) {
    const { attemptId, type, metadata } = data;
    const deduction = TRUST_SCORE_DEDUCTIONS[type] || 0;

    const result = await this.proctorService.recordEvent(attemptId, type, deduction, metadata);

    // Broadcast to proctors in this room
    this.server.to(`attempt:${attemptId}`).emit('proctor:event:recorded', {
      event: result.event,
      trustScore: result.trustScore,
    });

    this.logger.log(`Event [${type}] for attempt ${attemptId}, trustScore: ${result.trustScore}`);
  }

  @SubscribeMessage('proctor:screenshot')
  async handleScreenshot(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { attemptId: string; image: string }, // image: base64
  ) {
    const { attemptId, image } = data;
    const evidence = await this.proctorService.saveScreenshot(attemptId, image);

    // Notify proctors
    this.server.to(`attempt:${attemptId}`).emit('proctor:screenshot:saved', {
      attemptId,
      url: evidence.url,
      createdAt: evidence.createdAt,
    });
  }

  @SubscribeMessage('proctor:end')
  async handleEnd(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { attemptId: string },
  ) {
    const { attemptId } = data;
    const result = await this.proctorService.endSession(attemptId);

    this.server.to(`attempt:${attemptId}`).emit('proctor:ended', {
      attemptId,
      trustScore: result.trustScore,
      status: result.status,
    });

    this.logger.log(`Proctor session ended for attempt ${attemptId}`);
  }
}
