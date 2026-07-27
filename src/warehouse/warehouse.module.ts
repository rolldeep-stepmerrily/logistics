import { JwtGuard } from '@@guards';
import { Module } from '@nestjs/common';

import { CreateWarehouseCommandHandler } from './application/commands/create-warehouse.command';
import { GetWarehousesQueryHandler } from './application/queries/get-warehouses.query';
import { CreateWarehouseUseCase } from './application/use-cases/create-warehouse.use-case';
import { GetWarehousesUseCase } from './application/use-cases/get-warehouses.use-case';
import { WarehouseHttpController } from './presenter/http/warehouse.http.controller';

@Module({
  controllers: [WarehouseHttpController],
  providers: [
    GetWarehousesQueryHandler,
    CreateWarehouseCommandHandler,
    CreateWarehouseUseCase,
    GetWarehousesUseCase,
    JwtGuard,
  ],
})
export class WarehouseModule {}
