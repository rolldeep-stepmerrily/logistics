import { PrismaService } from '@@db';
import { AppException } from '@@exceptions';
import { WarehouseType } from '@@prisma';
import { Command, CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { WAREHOUSE_ERRORS } from '../../warehouse.error';

interface CreateWarehouseResult {
  id: number;
  code: string;
}

export class CreateWarehouseCommand extends Command<CreateWarehouseResult> {
  constructor(public readonly props: CreateWarehouseCommandProps) {
    super();
  }
}

@CommandHandler(CreateWarehouseCommand)
export class CreateWarehouseCommandHandler
  implements ICommandHandler<CreateWarehouseCommand, CreateWarehouseResult>
{
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: CreateWarehouseCommand): Promise<CreateWarehouseResult> {
    const { code } = command.props;

    const existing = await this.prisma.warehouse.findUnique({ where: { code }, select: { id: true } });
    if (existing) throw new AppException(WAREHOUSE_ERRORS.DUPLICATE_CODE);

    return await this.prisma.warehouse.create({
      data: command.props,
      select: { id: true, code: true },
    });
  }
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
