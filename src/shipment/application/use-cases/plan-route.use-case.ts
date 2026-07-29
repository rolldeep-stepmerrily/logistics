import { TypedCommandBus } from '@@cqrs';
import { Injectable } from '@nestjs/common';

import { PlanRouteRequestBodyDto, PlanRouteResponseDataDto } from '../../presenter/http/dto/plan-route.dto';
import { PlanRouteCommand } from '../commands/plan-route.command';

@Injectable()
export class PlanRouteUseCase {
  constructor(private readonly commandBus: TypedCommandBus<PlanRouteCommand>) {}

  /**
   * 라우팅 계획 설정 UseCase 진입점
   *
   * @param {PlanRouteUseCaseProps} props 실행 파라미터
   * @returns {Promise<PlanRouteResponseDataDto>} 라우팅 계획 응답 DTO
   */
  async execute(props: PlanRouteUseCaseProps): Promise<PlanRouteResponseDataDto> {
    const result = await this.commandBus.execute(
      new PlanRouteCommand({ shipmentId: props.shipmentId, hops: props.bodyDto.hops }),
    );

    return PlanRouteResponseDataDto.from({
      shipmentId: result.shipmentId,
      hops: result.hops,
      totalHops: result.totalHops,
      etaMinutes: result.etaMinutes,
      source: result.source,
    });
  }
}

interface PlanRouteUseCaseProps {
  shipmentId: number;
  bodyDto: PlanRouteRequestBodyDto;
}
