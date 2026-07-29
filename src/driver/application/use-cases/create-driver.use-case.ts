import { TypedCommandBus } from '@@cqrs';
import { Injectable } from '@nestjs/common';

import { CreateDriverRequestBodyDto, CreateDriverResponseDataDto } from '../../presenter/http/dto/create-driver.dto';
import { CreateDriverCommand } from '../commands/create-driver.command';

@Injectable()
export class CreateDriverUseCase {
  constructor(private readonly commandBus: TypedCommandBus<CreateDriverCommand>) {}

  /**
   * 신규 기사 등록 UseCase 진입점
   *
   * @param {CreateDriverUseCaseProps} props 실행 파라미터
   * @returns {Promise<CreateDriverResponseDataDto>} 등록된 기사 응답 DTO
   */
  async execute(props: CreateDriverUseCaseProps): Promise<CreateDriverResponseDataDto> {
    const driver = await this.commandBus.execute(new CreateDriverCommand(props.bodyDto));

    return CreateDriverResponseDataDto.from(driver);
  }
}

interface CreateDriverUseCaseProps {
  bodyDto: CreateDriverRequestBodyDto;
}
