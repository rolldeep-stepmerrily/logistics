import { PrismaService } from '@@db';
import { ShipmentStatus } from '@@prisma';
import { IQueryHandler, Query, QueryHandler } from '@nestjs/cqrs';

interface ShipmentEventRow {
  id: number;
  fromStatus: ShipmentStatus | null;
  toStatus: ShipmentStatus;
  eventType: string;
  occurredAt: Date;
}

export class GetShipmentEventsQuery extends Query<ShipmentEventRow[]> {
  constructor(public readonly props: { shipmentId: number }) {
    super();
  }
}

@QueryHandler(GetShipmentEventsQuery)
export class GetShipmentEventsQueryHandler implements IQueryHandler<GetShipmentEventsQuery, ShipmentEventRow[]> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: GetShipmentEventsQuery): Promise<ShipmentEventRow[]> {
    return await this.prisma.shipmentEvent.findMany({
      where: { shipmentId: query.props.shipmentId },
      orderBy: { occurredAt: 'asc' },
      select: { id: true, fromStatus: true, toStatus: true, eventType: true, occurredAt: true },
    });
  }
}
