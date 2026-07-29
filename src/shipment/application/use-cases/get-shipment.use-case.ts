import { TypedQueryBus } from '@@cqrs';
import { AppException } from '@@exceptions';
import { Injectable } from '@nestjs/common';
import { isDefined } from 'class-validator';

import { GetShipmentResponseDataDto } from '../../presenter/http/dto/get-shipment.dto';
import { SHIPMENT_ERRORS } from '../../shipment.error';
import { GetShipmentQuery } from '../queries/get-shipment.query';

@Injectable()
export class GetShipmentUseCase {
  constructor(private readonly queryBus: TypedQueryBus<GetShipmentQuery>) {}

  /**
   * 송장 단건 조회 UseCase 진입점. 미존재 시 예외 발생
   *
   * @param {GetShipmentUseCaseProps} props 실행 파라미터
   * @returns {Promise<GetShipmentResponseDataDto>} 송장 상세 응답 DTO
   */
  async execute(props: GetShipmentUseCaseProps): Promise<GetShipmentResponseDataDto> {
    const shipment = await this.queryBus.execute(new GetShipmentQuery({ shipmentId: props.shipmentId }));

    if (!isDefined(shipment)) {
      throw new AppException(SHIPMENT_ERRORS.NOT_FOUND);
    }

    return GetShipmentResponseDataDto.from(shipment);
  }
}

interface GetShipmentUseCaseProps {
  shipmentId: number;
}
