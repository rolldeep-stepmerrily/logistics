import { TypedQueryBus } from '@@cqrs';
import { Injectable } from '@nestjs/common';

import { GetShipmentEventsResponseDataDto } from '../../presenter/http/dto/get-shipment-events.dto';
import { GetShipmentEventsQuery } from '../queries/get-shipment-events.query';

@Injectable()
export class GetShipmentEventsUseCase {
  constructor(private readonly queryBus: TypedQueryBus<GetShipmentEventsQuery>) {}

  /**
   * 송장의 상태 전이 이력 조회 UseCase 진입점
   *
   * @param {GetShipmentEventsUseCaseProps} props 실행 파라미터
   * @returns {Promise<GetShipmentEventsResponseDataDto>} 이벤트 목록 응답 DTO
   */
  async execute(props: GetShipmentEventsUseCaseProps): Promise<GetShipmentEventsResponseDataDto> {
    const events = await this.queryBus.execute(new GetShipmentEventsQuery({ shipmentId: props.shipmentId }));

    return GetShipmentEventsResponseDataDto.from(events);
  }
}

interface GetShipmentEventsUseCaseProps {
  shipmentId: number;
}
