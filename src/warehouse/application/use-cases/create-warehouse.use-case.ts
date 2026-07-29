import { TypedCommandBus } from '@@cqrs';
import { Injectable } from '@nestjs/common';

import {
  CreateWarehouseRequestBodyDto,
  CreateWarehouseResponseDataDto,
} from '../../presenter/http/dto/create-warehouse.dto';
import { CreateWarehouseCommand } from '../commands/create-warehouse.command';

@Injectable()
export class CreateWarehouseUseCase {
  constructor(private readonly commandBus: TypedCommandBus<CreateWarehouseCommand>) {}

  /**
   * 신규 창고 생성 UseCase 진입점
   *
   * @param {CreateWarehouseUseCaseProps} props 실행 파라미터
   * @returns {Promise<CreateWarehouseResponseDataDto>} 생성된 창고 응답 DTO
   */
  async execute(props: CreateWarehouseUseCaseProps): Promise<CreateWarehouseResponseDataDto> {
    const warehouse = await this.commandBus.execute(new CreateWarehouseCommand(props.bodyDto));

    return CreateWarehouseResponseDataDto.from(warehouse);
  }
}

interface CreateWarehouseUseCaseProps {
  bodyDto: CreateWarehouseRequestBodyDto;
}
