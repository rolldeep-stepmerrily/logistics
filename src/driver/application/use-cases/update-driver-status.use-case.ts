import { TypedCommandBus } from '@@cqrs';
import { Injectable } from '@nestjs/common';

import {
  UpdateDriverStatusRequestBodyDto,
  UpdateDriverStatusResponseDataDto,
} from '../../presenter/http/dto/update-driver-status.dto';
import { UpdateDriverStatusCommand } from '../commands/update-driver-status.command';

@Injectable()
export class UpdateDriverStatusUseCase {
  constructor(private readonly commandBus: TypedCommandBus<UpdateDriverStatusCommand>) {}

  /**
   * 기사 상태 수동 변경 UseCase 진입점
   *
   * @param {UpdateDriverStatusUseCaseProps} props 실행 파라미터
   * @returns {Promise<UpdateDriverStatusResponseDataDto>} 변경된 기사 상태 응답 DTO
   */
  async execute(props: UpdateDriverStatusUseCaseProps): Promise<UpdateDriverStatusResponseDataDto> {
    const driver = await this.commandBus.execute(
      new UpdateDriverStatusCommand({ driverId: props.driverId, status: props.bodyDto.status }),
    );

    return UpdateDriverStatusResponseDataDto.from(driver);
  }
}

interface UpdateDriverStatusUseCaseProps {
  driverId: number;
  bodyDto: UpdateDriverStatusRequestBodyDto;
}
