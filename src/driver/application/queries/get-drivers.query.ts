import { PrismaService } from '@@db';
import { DriverStatus, Prisma, VehicleType } from '@@prisma';
import { IQueryHandler, Query, QueryHandler } from '@nestjs/cqrs';
import { isDefined } from 'class-validator';

export class GetDriversQuery extends Query<DriverRow[]> {
  constructor(public readonly props: GetDriversQueryProps) {
    super();
  }
}

@QueryHandler(GetDriversQuery)
export class GetDriversQueryHandler implements IQueryHandler<GetDriversQuery, DriverRow[]> {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * status / warehouse 필터로 기사 목록 조회
   *
   * @param {GetDriversQuery} query 쿼리 인스턴스
   * @returns {Promise<DriverRow[]>} 기사 목록
   */
  async execute(query: GetDriversQuery): Promise<DriverRow[]> {
    const where: Prisma.DriverWhereInput = {};

    if (isDefined(query.props.status)) {
      where.status = query.props.status;
    }

    if (isDefined(query.props.currentWarehouseId)) {
      where.currentWarehouseId = query.props.currentWarehouseId;
    }

    return await this.prisma.driver.findMany({
      where,
      orderBy: { id: 'asc' },
      select: { id: true, name: true, vehicleType: true, status: true, currentWarehouseId: true },
    });
  }
}

interface DriverRow {
  id: number;
  name: string;
  vehicleType: VehicleType;
  status: DriverStatus;
  currentWarehouseId: number | null;
}

interface GetDriversQueryProps {
  status?: DriverStatus;
  currentWarehouseId?: number;
}
