import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );
  const origin = process.env.CORS_ORIGIN ?? '*';
  app.enableCors({
    origin: origin === '*' ? true : origin.split(',').map((s) => s.trim()),
    credentials: true,
  });
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port, '0.0.0.0');
  console.log(`PrintManager API listening on :${port}`);
}
bootstrap();
