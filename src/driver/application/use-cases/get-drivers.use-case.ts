import { TypedQueryBus } from '@@cqrs';
import { Injectable } from '@nestjs/common';

import { GetDriversRequestQueryDto, GetDriversResponseDataDto } from '../../presenter/http/dto/get-drivers.dto';
import { GetDriversQuery } from '../queries/get-drivers.query';

@Injectable()
export class GetDriversUseCase {
  constructor(private readonly queryBus: TypedQueryBus<GetDriversQuery>) {}

  /**
   * 기사 목록 조회 UseCase 진입점
   *
   * @param {GetDriversUseCaseProps} props 실행 파라미터
   * @returns {Promise<GetDriversResponseDataDto>} 기사 목록 응답 DTO
   */
  async execute(props: GetDriversUseCaseProps): Promise<GetDriversResponseDataDto> {
    const drivers = await this.queryBus.execute(new GetDriversQuery(props.queryDto));

    return GetDriversResponseDataDto.from(drivers);
  }
}

interface GetDriversUseCaseProps {
  queryDto: GetDriversRequestQueryDto;
}
