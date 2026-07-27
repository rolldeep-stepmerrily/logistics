import { TypedQueryBus } from '@@cqrs';
import { Injectable } from '@nestjs/common';

import { GetDriversRequestQueryDto, GetDriversResponseDataDto } from '../../presenter/http/dto/get-drivers.dto';
import { GetDriversQuery } from '../queries/get-drivers.query';

@Injectable()
export class GetDriversUseCase {
  constructor(private readonly queryBus: TypedQueryBus<GetDriversQuery>) {}

  async execute(props: { queryDto: GetDriversRequestQueryDto }): Promise<GetDriversResponseDataDto> {
    const drivers = await this.queryBus.execute(new GetDriversQuery(props.queryDto));
    return { drivers };
  }
}
