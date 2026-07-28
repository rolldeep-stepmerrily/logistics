import { PrismaService } from '@@db';
import { ActorType, ShipmentStatus } from '@@prisma';
import { randomBytes } from 'node:crypto';
import { Command, CommandHandler, ICommandHandler } from '@nestjs/cqrs';

interface CreateShipmentResult {
  id: number;
  trackingNumber: string;
  status: ShipmentStatus;
}

export class CreateShipmentCommand extends Command<CreateShipmentResult> {
  constructor(public readonly props: CreateShipmentCommandProps) {
    super();
  }
}

@CommandHandler(CreateShipmentCommand)
export class CreateShipmentCommandHandler implements ICommandHandler<CreateShipmentCommand, CreateShipmentResult> {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Shipment 생성 + 초기 상태(CREATED) 이력 기록 (단일 트랜잭션).
   *
   * @param {CreateShipmentCommand} command 생성 커맨드
   * @returns {Promise<CreateShipmentResult>} 생성된 shipment
   */
  async execute(command: CreateShipmentCommand): Promise<CreateShipmentResult> {
    const {
      senderId,
      recipientName,
      recipientPhone,
      recipientAddr,
      originHubId,
      destinationHubId,
      weightG,
      declaredValue,
    } = command.props;

    const trackingNumber = `WP-${randomBytes(4).toString('hex').toUpperCase()}`;

    return await this.prisma.$transaction(async (tx) => {
      const shipment = await tx.shipment.create({
        data: {
          trackingNumber,
          senderId,
          recipientName,
          recipientPhone,
          recipientAddr,
          originHubId,
          destinationHubId,
          weightG,
          declaredValue,
        },
        select: { id: true, trackingNumber: true, status: true },
      });

      await tx.shipmentEvent.create({
        data: {
          shipmentId: shipment.id,
          fromStatus: null,
          toStatus: ShipmentStatus.CREATED,
          eventType: 'CREATED',
          payload: { originHubId, destinationHubId },
          actorType: ActorType.SENDER,
          actorId: String(senderId),
        },
      });

      return shipment;
    });
  }
}

interface CreateShipmentCommandProps {
  senderId: number;
  recipientName: string;
  recipientPhone: string;
  recipientAddr: string;
  originHubId: number;
  destinationHubId: number;
  weightG: number;
  declaredValue?: number;
}
