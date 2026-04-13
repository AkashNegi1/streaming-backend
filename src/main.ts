import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import * as dotenv from 'dotenv';
dotenv.config();
async function bootstrap() {
  const corsOrigins = process.env.CORS_ORIGINS?.split(',');;
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: corsOrigins,
    credentials: true
  })
  await app.listen(process.env.PORT || 3000);
}
bootstrap();
