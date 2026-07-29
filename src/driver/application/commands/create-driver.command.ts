import { PrismaService } from '@@db';
import { AppException } from '@@exceptions';
import { VehicleType } from '@@prisma';
import { Command, CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { isDefined } from 'class-validator';

import { DRIVER_ERRORS } from '../../driver.error';

export class CreateDriverCommand extends Command<CreateDriverResult> {
  constructor(public readonly props: CreateDriverCommandProps) {
    super();
  }
}

@CommandHandler(CreateDriverCommand)
export class CreateDriverCommandHandler implements ICommandHandler<CreateDriverCommand, CreateDriverResult> {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 신규 기사 레코드 생성. 전화번호 중복 시 예외 발생
   *
   * @param {CreateDriverCommand} command 커맨드 인스턴스
   * @returns {Promise<CreateDriverResult>} 생성된 기사 요약
   */
  async execute(command: CreateDriverCommand): Promise<CreateDriverResult> {
    const { phone } = command.props;

    const existing = await this.prisma.driver.findUnique({ where: { phone }, select: { id: true } });

    if (isDefined(existing)) {
      throw new AppException(DRIVER_ERRORS.DUPLICATE_PHONE);
    }

    return await this.prisma.driver.create({
      data: command.props,
      select: { id: true, name: true },
    });
  }
}

interface CreateDriverResult {
  id: number;
  name: string;
}

interface CreateDriverCommandProps {
  name: string;
  phone: string;
  vehicleType: VehicleType;
  currentWarehouseId?: number;
}
