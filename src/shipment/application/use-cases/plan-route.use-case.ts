import { TypedCommandBus } from '@@cqrs';
import { Injectable } from '@nestjs/common';

import { PlanRouteRequestBodyDto, PlanRouteResponseDataDto } from '../../presenter/http/dto/plan-route.dto';
import { PlanRouteCommand } from '../commands/plan-route.command';

@Injectable()
export class PlanRouteUseCase {
  constructor(private readonly commandBus: TypedCommandBus<PlanRouteCommand>) {}

  async execute(props: { shipmentId: number; bodyDto: PlanRouteRequestBodyDto }): Promise<PlanRouteResponseDataDto> {
    const result = await this.commandBus.execute(
      new PlanRouteCommand({ shipmentId: props.shipmentId, hops: props.bodyDto.hops }),
    );
    return { shipmentId: result.shipmentId, hops: result.hops, totalHops: result.totalHops };
  }
}
