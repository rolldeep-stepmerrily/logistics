import { TypedCommandBus } from '@@cqrs';
import { Injectable, Logger } from '@nestjs/common';

import {
  CreateShipmentRequestBodyDto,
  CreateShipmentResponseDataDto,
} from '../../presenter/http/dto/create-shipment.dto';
import { CreateShipmentCommand } from '../commands/create-shipment.command';

@Injectable()
export class CreateShipmentUseCase {
  private readonly logger = new Logger(CreateShipmentUseCase.name);

  constructor(private readonly commandBus: TypedCommandBus<CreateShipmentCommand>) {}

  async execute(props: {
    senderId: number;
    bodyDto: CreateShipmentRequestBodyDto;
  }): Promise<CreateShipmentResponseDataDto> {
    const { senderId, bodyDto } = props;

    const shipment = await this.commandBus.execute(
      new CreateShipmentCommand({
        senderId,
        recipientName: bodyDto.recipientName,
        recipientPhone: bodyDto.recipientPhone,
        recipientAddr: bodyDto.recipientAddr,
        originHubId: bodyDto.originHubId,
        destinationHubId: bodyDto.destinationHubId,
        weightG: bodyDto.weightG,
        declaredValue: bodyDto.declaredValue,
      }),
    );

    this.logger.log(`Shipment created: id=${shipment.id}, tracking=${shipment.trackingNumber}`);

    return CreateShipmentResponseDataDto.from({
      id: shipment.id,
      trackingNumber: shipment.trackingNumber,
      status: shipment.status,
    });
  }
}
