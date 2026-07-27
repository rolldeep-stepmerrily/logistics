import { TypedCommandBus } from '@@cqrs';
import { Injectable } from '@nestjs/common';

import { CreateDriverRequestBodyDto, CreateDriverResponseDataDto } from '../../presenter/http/dto/create-driver.dto';
import { CreateDriverCommand } from '../commands/create-driver.command';

@Injectable()
export class CreateDriverUseCase {
  constructor(private readonly commandBus: TypedCommandBus<CreateDriverCommand>) {}

  async execute(props: { bodyDto: CreateDriverRequestBodyDto }): Promise<CreateDriverResponseDataDto> {
    return await this.commandBus.execute(new CreateDriverCommand(props.bodyDto));
  }
}
