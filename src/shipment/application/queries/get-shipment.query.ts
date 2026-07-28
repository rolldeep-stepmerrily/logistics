import { PrismaService } from '@@db';
import { DeliveryPhase, PaymentStatus, ShipmentStatus } from '@@prisma';
import { IQueryHandler, Query, QueryHandler } from '@nestjs/cqrs';

interface GetShipmentResult {
  id: number;
  trackingNumber: string;
  status: ShipmentStatus;
  paymentStatus: PaymentStatus;
  paidAmount: number | null;
  deliveryPhase: DeliveryPhase | null;
  deliveryStartedAt: Date | null;
  arrivedAtDoorAt: Date | null;
  recipientName: string;
  recipientAddr: string;
  originHubId: number;
  destinationHubId: number;
  currentHubId: number | null;
  createdAt: Date;
}

export class GetShipmentQuery extends Query<GetShipmentResult | null> {
  constructor(public readonly props: { shipmentId: number }) {
    super();
  }
}

@QueryHandler(GetShipmentQuery)
export class GetShipmentQueryHandler implements IQueryHandler<GetShipmentQuery, GetShipmentResult | null> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: GetShipmentQuery): Promise<GetShipmentResult | null> {
    return await this.prisma.shipment.findUnique({
      where: { id: query.props.shipmentId },
      select: {
        id: true,
        trackingNumber: true,
        status: true,
        paymentStatus: true,
        paidAmount: true,
        deliveryPhase: true,
        deliveryStartedAt: true,
        arrivedAtDoorAt: true,
        recipientName: true,
        recipientAddr: true,
        originHubId: true,
        destinationHubId: true,
        currentHubId: true,
        createdAt: true,
      },
    });
  }
}
