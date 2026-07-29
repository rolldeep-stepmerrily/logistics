import { PrismaService } from '@@db';
import { WarehouseType } from '@@prisma';
import { IQueryHandler, Query, QueryHandler } from '@nestjs/cqrs';

export class GetWarehousesQuery extends Query<WarehouseRow[]> {}

@QueryHandler(GetWarehousesQuery)
export class GetWarehousesQueryHandler implements IQueryHandler<GetWarehousesQuery, WarehouseRow[]> {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 전체 창고 목록 조회
   *
   * @returns {Promise<WarehouseRow[]>} 창고 목록
   */
  async execute(): Promise<WarehouseRow[]> {
    return await this.prisma.warehouse.findMany({
      orderBy: { code: 'asc' },
      select: { id: true, code: true, name: true, type: true, address: true, capacity: true },
    });
  }
}

interface WarehouseRow {
  id: number;
  code: string;
  name: string;
  type: WarehouseType;
  address: string;
  capacity: number;
}
