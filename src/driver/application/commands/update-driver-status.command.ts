import { PrismaService } from '@@db';
import { AppException } from '@@exceptions';
import { DriverStatus } from '@@prisma';
import { Command, CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { isDefined } from 'class-validator';

import { DRIVER_ERRORS } from '../../driver.error';

/**
 * BUSY 상태로의 임의 변경은 금지 — BUSY 는 배차 배정 시에만 부여된다.
 */
const ALLOWED_TRANSITIONS: Record<DriverStatus, DriverStatus[]> = {
  OFFLINE: [DriverStatus.AVAILABLE],
  AVAILABLE: [DriverStatus.OFFLINE],
  BUSY: [DriverStatus.OFFLINE],
};

export class UpdateDriverStatusCommand extends Command<UpdateDriverStatusResult> {
  constructor(public readonly props: UpdateDriverStatusCommandProps) {
    super();
  }
}

@CommandHandler(UpdateDriverStatusCommand)
export class UpdateDriverStatusCommandHandler
  implements ICommandHandler<UpdateDriverStatusCommand, UpdateDriverStatusResult>
{
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 기사 상태 변경. 허용되지 않은 전이 시 예외 발생
   *
   * @param {UpdateDriverStatusCommand} command 커맨드 인스턴스
   * @returns {Promise<UpdateDriverStatusResult>} 변경된 기사 요약
   */
  async execute(command: UpdateDriverStatusCommand): Promise<UpdateDriverStatusResult> {
    const { driverId, status } = command.props;

    const driver = await this.prisma.driver.findUnique({ where: { id: driverId }, select: { status: true } });

    if (!isDefined(driver)) {
      throw new AppException(DRIVER_ERRORS.NOT_FOUND);
    }

    if (!ALLOWED_TRANSITIONS[driver.status].includes(status)) {
      throw new AppException(DRIVER_ERRORS.INVALID_STATUS_CHANGE);
    }

    return await this.prisma.driver.update({
      where: { id: driverId },
      data: { status },
      select: { id: true, status: true },
    });
  }
}

interface UpdateDriverStatusResult {
  id: number;
  status: DriverStatus;
}

interface UpdateDriverStatusCommandProps {
  driverId: number;
  status: DriverStatus;
}
