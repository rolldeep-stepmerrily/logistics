import { TypedQueryBus } from '@@cqrs';
import { AppException } from '@@exceptions';
import { Injectable } from '@nestjs/common';

import { GetShipmentResponseDataDto } from '../../presenter/http/dto/get-shipment.dto';
import { SHIPMENT_ERRORS } from '../../shipment.error';
import { GetShipmentQuery } from '../queries/get-shipment.query';

@Injectable()
export class GetShipmentUseCase {
  constructor(private readonly queryBus: TypedQueryBus<GetShipmentQuery>) {}

  async execute(props: { shipmentId: number }): Promise<GetShipmentResponseDataDto> {
    const shipment = await this.queryBus.execute(new GetShipmentQuery({ shipmentId: props.shipmentId }));
    if (!shipment) throw new AppException(SHIPMENT_ERRORS.NOT_FOUND);
    return shipment;
  }
}
