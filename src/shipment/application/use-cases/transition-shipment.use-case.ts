import { TypedCommandBus } from '@@cqrs';
import { AppException } from '@@exceptions';
import { ActorType } from '@@prisma';
import type { ShipmentEventInput } from '@@state-machines';
import { Injectable, Logger } from '@nestjs/common';

import {
  ShipmentTransitionEventType,
  TransitionPayloadDto,
  TransitionShipmentRequestBodyDto,
  TransitionShipmentResponseDataDto,
} from '../../presenter/http/dto/transition-shipment.dto';
import { SHIPMENT_ERRORS } from '../../shipment.error';
import { TransitionShipmentCommand } from '../commands/transition-shipment.command';

@Injectable()
export class TransitionShipmentUseCase {
  private readonly logger = new Logger(TransitionShipmentUseCase.name);

  constructor(private readonly commandBus: TypedCommandBus<TransitionShipmentCommand>) {}

  /**
   * HTTP body의 event/payload를 XState machine이 받는 discriminated union으로 변환하여 커맨드에 위임.
   */
  async execute(props: {
    shipmentId: number;
    actorId: number;
    bodyDto: TransitionShipmentRequestBodyDto;
  }): Promise<TransitionShipmentResponseDataDto> {
    const { shipmentId, actorId, bodyDto } = props;

    const event = this.toMachineEvent(bodyDto.event, bodyDto.payload);

    const result = await this.commandBus.execute(
      new TransitionShipmentCommand({
        shipmentId,
        event,
        actorType: ActorType.ADMIN,
        actorId: String(actorId),
      }),
    );

    this.logger.log(
      `Shipment transition: id=${shipmentId} delivery=${result.previousStatus}→${result.currentStatus} ` +
        `payment=${result.previousPaymentStatus}→${result.currentPaymentStatus} via ${bodyDto.event}`,
    );

    return TransitionShipmentResponseDataDto.from({
      id: result.id,
      previousStatus: result.previousStatus,
      currentStatus: result.currentStatus,
      previousPaymentStatus: result.previousPaymentStatus,
      currentPaymentStatus: result.currentPaymentStatus,
    });
  }

  private toMachineEvent(type: ShipmentTransitionEventType, payload?: TransitionPayloadDto): ShipmentEventInput {
    switch (type) {
      case ShipmentTransitionEventType.AssignPickupDriver:
      case ShipmentTransitionEventType.DispatchLastMile: {
        if (!payload?.driverId) throw new AppException(SHIPMENT_ERRORS.DRIVER_NOT_AVAILABLE);
        return { type, driverId: payload.driverId };
      }
      case ShipmentTransitionEventType.Deliver: {
        if (!payload?.proofUrl) throw new AppException(SHIPMENT_ERRORS.DELIVERY_PROOF_REQUIRED);
        return { type, proofUrl: payload.proofUrl };
      }
      case ShipmentTransitionEventType.FailDelivery: {
        return { type, reason: payload?.reason ?? 'UNKNOWN' };
      }
      case ShipmentTransitionEventType.ConfirmPayment: {
        if (!payload?.amount) throw new AppException(SHIPMENT_ERRORS.PAYMENT_AMOUNT_REQUIRED);
        return { type, amount: payload.amount };
      }
      case ShipmentTransitionEventType.RequestPickup:
      case ShipmentTransitionEventType.MarkPickedUp:
      case ShipmentTransitionEventType.ArriveAtOriginHub:
      case ShipmentTransitionEventType.DispatchLineHaul:
      case ShipmentTransitionEventType.ArriveAtHub:
      case ShipmentTransitionEventType.RetryDelivery:
      case ShipmentTransitionEventType.Return:
      case ShipmentTransitionEventType.Cancel:
      case ShipmentTransitionEventType.RefundPayment:
        return { type };
      default: {
        const _exhaustive: never = type;
        return _exhaustive;
      }
    }
  }
}
