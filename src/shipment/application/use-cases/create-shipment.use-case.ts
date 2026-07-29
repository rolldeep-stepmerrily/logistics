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

  /**
   * 송장 생성 UseCase 진입점
   *
   * @param {CreateShipmentUseCaseProps} props 실행 파라미터
   * @returns {Promise<CreateShipmentResponseDataDto>} 생성된 송장 응답 DTO
   */
  async execute(props: CreateShipmentUseCaseProps): Promise<CreateShipmentResponseDataDto> {
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

interface CreateShipmentUseCaseProps {
  senderId: number;
  bodyDto: CreateShipmentRequestBodyDto;
}
