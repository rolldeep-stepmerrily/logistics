import { PrismaService } from '@@db';
import { DriverStatus, Prisma, VehicleType } from '@@prisma';
import { IQueryHandler, Query, QueryHandler } from '@nestjs/cqrs';

interface DriverRow {
  id: number;
  name: string;
  vehicleType: VehicleType;
  status: DriverStatus;
  currentWarehouseId: number | null;
}

export class GetDriversQuery extends Query<DriverRow[]> {
  constructor(public readonly props: { status?: DriverStatus; currentWarehouseId?: number }) {
    super();
  }
}

@QueryHandler(GetDriversQuery)
export class GetDriversQueryHandler implements IQueryHandler<GetDriversQuery, DriverRow[]> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: GetDriversQuery): Promise<DriverRow[]> {
    const where: Prisma.DriverWhereInput = {};
    if (query.props.status) where.status = query.props.status;
    if (query.props.currentWarehouseId) where.currentWarehouseId = query.props.currentWarehouseId;

    return await this.prisma.driver.findMany({
      where,
      orderBy: { id: 'asc' },
      select: { id: true, name: true, vehicleType: true, status: true, currentWarehouseId: true },
    });
  }
}
