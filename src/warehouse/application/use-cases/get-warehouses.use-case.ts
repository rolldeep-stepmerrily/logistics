import { TypedQueryBus } from '@@cqrs';
import { Injectable } from '@nestjs/common';

import { GetWarehousesResponseDataDto } from '../../presenter/http/dto/get-warehouses.dto';
import { GetWarehousesQuery } from '../queries/get-warehouses.query';

@Injectable()
export class GetWarehousesUseCase {
  constructor(private readonly queryBus: TypedQueryBus<GetWarehousesQuery>) {}

  /**
   * 창고 목록 조회 UseCase 진입점
   *
   * @returns {Promise<GetWarehousesResponseDataDto>} 창고 목록 응답 DTO
   */
  async execute(): Promise<GetWarehousesResponseDataDto> {
    const warehouses = await this.queryBus.execute(new GetWarehousesQuery());

    return GetWarehousesResponseDataDto.from(warehouses);
  }
}
