import { JwtGuard } from '@@guards';
import { RoutingService } from '@@state-machines';
import { Module } from '@nestjs/common';

import { CreateShipmentCommandHandler } from './application/commands/create-shipment.command';
import { PlanRouteCommandHandler } from './application/commands/plan-route.command';
import { TransitionShipmentCommandHandler } from './application/commands/transition-shipment.command';
import { GetShipmentQueryHandler } from './application/queries/get-shipment.query';
import { GetShipmentEventsQueryHandler } from './application/queries/get-shipment-events.query';
import { DeliveryTimeoutService } from './application/schedulers/delivery-timeout.service';
import { CreateShipmentUseCase } from './application/use-cases/create-shipment.use-case';
import { GetShipmentUseCase } from './application/use-cases/get-shipment.use-case';
import { GetShipmentEventsUseCase } from './application/use-cases/get-shipment-events.use-case';
import { PlanRouteUseCase } from './application/use-cases/plan-route.use-case';
import { TransitionShipmentUseCase } from './application/use-cases/transition-shipment.use-case';
import { ShipmentHttpController } from './presenter/http/shipment.http.controller';

@Module({
  controllers: [ShipmentHttpController],
  providers: [
    /** query-handlers */
    GetShipmentQueryHandler,
    GetShipmentEventsQueryHandler,

    /** command-handlers */
    CreateShipmentCommandHandler,
    TransitionShipmentCommandHandler,
    PlanRouteCommandHandler,

    /** use-cases */
    CreateShipmentUseCase,
    GetShipmentUseCase,
    GetShipmentEventsUseCase,
    TransitionShipmentUseCase,
    PlanRouteUseCase,

    /** schedulers */
    DeliveryTimeoutService,

    /** infrastructure */
    JwtGuard,
    RoutingService,
  ],
})
export class ShipmentModule {}
