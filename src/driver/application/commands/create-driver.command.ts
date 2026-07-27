import { PrismaService } from '@@db';
import { AppException } from '@@exceptions';
import { VehicleType } from '@@prisma';
import { Command, CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { DRIVER_ERRORS } from '../../driver.error';

interface CreateDriverResult {
  id: number;
  name: string;
}

export class CreateDriverCommand extends Command<CreateDriverResult> {
  constructor(public readonly props: CreateDriverCommandProps) {
    super();
  }
}

@CommandHandler(CreateDriverCommand)
export class CreateDriverCommandHandler implements ICommandHandler<CreateDriverCommand, CreateDriverResult> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: CreateDriverCommand): Promise<CreateDriverResult> {
    const { phone } = command.props;

    const existing = await this.prisma.driver.findUnique({ where: { phone }, select: { id: true } });
    if (existing) throw new AppException(DRIVER_ERRORS.DUPLICATE_PHONE);

    return await this.prisma.driver.create({
      data: command.props,
      select: { id: true, name: true },
    });
  }
}

interface CreateDriverCommandProps {
  name: string;
  phone: string;
  vehicleType: VehicleType;
  currentWarehouseId?: number;
}
