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

  async execute(props: {
    driverId: number;
    bodyDto: UpdateDriverStatusRequestBodyDto;
  }): Promise<UpdateDriverStatusResponseDataDto> {
    return await this.commandBus.execute(
      new UpdateDriverStatusCommand({ driverId: props.driverId, status: props.bodyDto.status }),
    );
  }
}
