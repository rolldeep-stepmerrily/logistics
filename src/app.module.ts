import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import Joi from 'joi';

import { GlobalCqrsModule } from './common/cqrs';
import { KafkaModule } from './common/kafka';
import { HttpLoggerMiddleware } from './common/middlewares';
import { PrismaModule } from './common/prisma';
import { RedisModule, RedisThrottlerStorage } from './common/redis';
import { DriverModule } from './driver/driver.module';
import { ShipmentModule } from './shipment/shipment.module';
import { WarehouseModule } from './warehouse/warehouse.module';

@Module({
  imports: [
    RedisModule,
    ScheduleModule.forRoot(),
    ThrottlerModule.forRootAsync({
      inject: [RedisThrottlerStorage],
      useFactory: (redisThrottlerStorage: RedisThrottlerStorage) => ({
        throttlers: [{ name: 'default', ttl: 60_000, limit: 120 }],
        storage: redisThrottlerStorage,
      }),
    }),
    ConfigModule.forRoot({
      validationSchema: Joi.object({
        NODE_ENV: Joi.string().valid('local', 'development', 'production').default('development').empty(''),
        PORT: Joi.number().default(3001),
        DATABASE_URL: Joi.string().required(),
        REDIS_HOST: Joi.string().required(),
        REDIS_PORT: Joi.number().default(6379),
        REDIS_PASSWORD: Joi.string().optional(),
        KAFKA_BROKERS: Joi.string().required(),
        KAFKA_CLIENT_ID: Joi.string().required(),
        KAFKA_GROUP_ID: Joi.string().required(),
        JWT_ACCESS_SECRET: Joi.string().required(),
        JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
        JWT_REFRESH_SECRET: Joi.string().required(),
        JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),
      }),
      isGlobal: true,
      envFilePath: '.env',
      validationOptions: { abortEarly: true },
    }),
    GlobalCqrsModule,
    PrismaModule,
    KafkaModule,
    WarehouseModule,
    DriverModule,
    ShipmentModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(HttpLoggerMiddleware).forRoutes('{*splat}');
  }
}
