import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters';
import { TransformInterceptor } from './common/interceptors';

const bootstrap = async () => {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const configService = app.get(ConfigService);

  const nodeEnv = configService.getOrThrow<string>('NODE_ENV');
  const isProduction = nodeEnv === 'production';

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.KAFKA,
    options: {
      client: {
        clientId: configService.getOrThrow<string>('KAFKA_CLIENT_ID'),
        brokers: configService.getOrThrow<string>('KAFKA_BROKERS').split(','),
      },
      consumer: {
        groupId: configService.getOrThrow<string>('KAFKA_GROUP_ID'),
      },
    },
  });

  app.useGlobalInterceptors(new TransformInterceptor());

  app.useGlobalPipes(
    new ValidationPipe({
      disableErrorMessages: isProduction,
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  if (isProduction) {
    app.use(helmet());
  } else {
    const config = new DocumentBuilder()
      .setTitle('Logistics API')
      .setDescription('State machine 학습용 배송 도메인 API — Shipment 상태 전이는 /shipments/:id/transitions 로 실행')
      .setVersion('1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer' }, 'accessToken')
      .build();

    const document = SwaggerModule.createDocument(app, config);

    app.use(
      '/docs',
      apiReference({
        content: document,
        metaData: { title: 'Logistics' },
        theme: 'deepSpace',
      }),
    );
  }

  await app.startAllMicroservices();

  const port = configService.getOrThrow<number>('PORT');

  await app.listen(port);
};

bootstrap();
