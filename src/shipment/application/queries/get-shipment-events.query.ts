import { PrismaService } from '@@db';
import { ShipmentStatus } from '@@prisma';
import { IQueryHandler, Query, QueryHandler } from '@nestjs/cqrs';

export class GetShipmentEventsQuery extends Query<ShipmentEventRow[]> {
  constructor(public readonly props: GetShipmentEventsQueryProps) {
    super();
  }
}

@QueryHandler(GetShipmentEventsQuery)
export class GetShipmentEventsQueryHandler implements IQueryHandler<GetShipmentEventsQuery, ShipmentEventRow[]> {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 송장의 상태 전이 이벤트 이력 조회
   *
   * @param {GetShipmentEventsQuery} query 쿼리 인스턴스
   * @returns {Promise<ShipmentEventRow[]>} 이벤트 목록
   */
  async execute(query: GetShipmentEventsQuery): Promise<ShipmentEventRow[]> {
    return await this.prisma.shipmentEvent.findMany({
      where: { shipmentId: query.props.shipmentId },
      orderBy: { occurredAt: 'asc' },
      select: { id: true, fromStatus: true, toStatus: true, eventType: true, occurredAt: true },
    });
  }
}

interface ShipmentEventRow {
  id: number;
  fromStatus: ShipmentStatus | null;
  toStatus: ShipmentStatus;
  eventType: string;
  occurredAt: Date;
}

interface GetShipmentEventsQueryProps {
  shipmentId: number;
}
