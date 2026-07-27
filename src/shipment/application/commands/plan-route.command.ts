import { PrismaService } from '@@db';
import { AppException } from '@@exceptions';
import { Command, CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { SHIPMENT_ERRORS } from '../../shipment.error';

interface PlanRouteResult {
  shipmentId: number;
  hops: string[];
  totalHops: number;
}

export class PlanRouteCommand extends Command<PlanRouteResult> {
  constructor(public readonly props: { shipmentId: number; hops: string[] }) {
    super();
  }
}

@CommandHandler(PlanRouteCommand)
export class PlanRouteCommandHandler implements ICommandHandler<PlanRouteCommand, PlanRouteResult> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: PlanRouteCommand): Promise<PlanRouteResult> {
    const { shipmentId, hops } = command.props;

    const shipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
      select: { originHubId: true, destinationHubId: true },
    });
    if (!shipment) throw new AppException(SHIPMENT_ERRORS.NOT_FOUND);
    if (shipment.originHubId === shipment.destinationHubId) {
      throw new AppException(SHIPMENT_ERRORS.ORIGIN_EQUALS_DESTINATION);
    }

    await this.prisma.routePlan.upsert({
      where: { shipmentId },
      create: { shipmentId, hops, currentHopIndex: 0 },
      update: { hops, currentHopIndex: 0 },
    });

    return { shipmentId, hops, totalHops: hops.length };
  }
}
