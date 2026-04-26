import {
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import { OnModuleInit } from '@nestjs/common';
import { QueueEvents } from 'bullmq';
import 'dotenv/config'


@WebSocketGateway({
  cors: {
    origin: [`${process.env.CORS_ORIGINS}`],
  },
  transports: ['websocket']
})
export class VideoGateway implements OnModuleInit {
  @WebSocketServer()
  server: Server;

  onModuleInit() {

    const queueEvents = new QueueEvents('video-processing', {
      connection: {
        host: process.env.REDIS_HOST, // Use your actual TCP Redis host
        port: Number(process.env.REDIS_PORT),
        username: process.env.REDIS_USERNAME,
        password: process.env.REDIS_PASSWORD,
        tls: { rejectUnauthorized: false },
      },
    });

    queueEvents.on('progress', ({ jobId, data }, timestamp) => {
        this.server.emit('video-progress',{
            jobId: jobId,
            percent: data,
        })
    })
  }
  @SubscribeMessage('ping')
  handlePing(@MessageBody() data: any): string {
    console.log('Received  a ping from a client!', data);
    return 'pong - the phone line is open!';
  }
}
