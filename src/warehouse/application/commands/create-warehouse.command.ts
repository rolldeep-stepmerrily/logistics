import { PrismaService } from '@@db';
import { AppException } from '@@exceptions';
import { WarehouseType } from '@@prisma';
import { Command, CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { isDefined } from 'class-validator';

import { WAREHOUSE_ERRORS } from '../../warehouse.error';

export class CreateWarehouseCommand extends Command<CreateWarehouseResult> {
  constructor(public readonly props: CreateWarehouseCommandProps) {
    super();
  }
}

@CommandHandler(CreateWarehouseCommand)
export class CreateWarehouseCommandHandler implements ICommandHandler<CreateWarehouseCommand, CreateWarehouseResult> {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 신규 창고 레코드 생성. 코드 중복 시 예외 발생
   *
   * @param {CreateWarehouseCommand} command 커맨드 인스턴스
   * @returns {Promise<CreateWarehouseResult>} 생성된 창고 요약
   */
  async execute(command: CreateWarehouseCommand): Promise<CreateWarehouseResult> {
    const { code } = command.props;

    const existing = await this.prisma.warehouse.findUnique({ where: { code }, select: { id: true } });

    if (isDefined(existing)) {
      throw new AppException(WAREHOUSE_ERRORS.DUPLICATE_CODE);
    }

    return await this.prisma.warehouse.create({
      data: command.props,
      select: { id: true, code: true },
    });
  }
}

interface CreateWarehouseResult {
  id: number;
  code: string;
}

interface CreateWarehouseCommandProps {
  code: string;
  name: string;
  type: WarehouseType;
  address: string;
  latitude: number;
  longitude: number;
  capacity: number;
}
