import { TypedQueryBus } from '@@cqrs';
import { Injectable } from '@nestjs/common';

import { GetShipmentEventsResponseDataDto } from '../../presenter/http/dto/get-shipment.dto';
import { GetShipmentEventsQuery } from '../queries/get-shipment-events.query';

@Injectable()
export class GetShipmentEventsUseCase {
  constructor(private readonly queryBus: TypedQueryBus<GetShipmentEventsQuery>) {}

  async execute(props: { shipmentId: number }): Promise<GetShipmentEventsResponseDataDto> {
    const events = await this.queryBus.execute(new GetShipmentEventsQuery({ shipmentId: props.shipmentId }));
    return { events };
  }
}
