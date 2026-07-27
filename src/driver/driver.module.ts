import { JwtGuard } from '@@guards';
import { Module } from '@nestjs/common';

import { CreateDriverCommandHandler } from './application/commands/create-driver.command';
import { UpdateDriverStatusCommandHandler } from './application/commands/update-driver-status.command';
import { GetDriversQueryHandler } from './application/queries/get-drivers.query';
import { CreateDriverUseCase } from './application/use-cases/create-driver.use-case';
import { GetDriversUseCase } from './application/use-cases/get-drivers.use-case';
import { UpdateDriverStatusUseCase } from './application/use-cases/update-driver-status.use-case';
import { DriverHttpController } from './presenter/http/driver.http.controller';

@Module({
  controllers: [DriverHttpController],
  providers: [
    GetDriversQueryHandler,
    CreateDriverCommandHandler,
    UpdateDriverStatusCommandHandler,
    CreateDriverUseCase,
    GetDriversUseCase,
    UpdateDriverStatusUseCase,
    JwtGuard,
  ],
})
export class DriverModule {}
