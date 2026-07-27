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

  async execute(props: { bodyDto: CreateWarehouseRequestBodyDto }): Promise<CreateWarehouseResponseDataDto> {
    const result = await this.commandBus.execute(new CreateWarehouseCommand(props.bodyDto));
    return result;
  }
}
