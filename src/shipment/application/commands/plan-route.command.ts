import { PrismaService } from '@@db';
import { AppException } from '@@exceptions';
import { RoutingService, runRoutePlanning } from '@@state-machines';
import { Command, CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { SHIPMENT_ERRORS } from '../../shipment.error';

interface PlanRouteResult {
  shipmentId: number;
  hops: string[];
  totalHops: number;
  etaMinutes: number | null;
  source: 'manual' | 'auto';
}

export class PlanRouteCommand extends Command<PlanRouteResult> {
  constructor(public readonly props: { shipmentId: number; hops?: string[] }) {
    super();
  }
}

@CommandHandler(PlanRouteCommand)
export class PlanRouteCommandHandler implements ICommandHandler<PlanRouteCommand, PlanRouteResult> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly routingService: RoutingService,
  ) {}

  /**
   * hops 가 주어지면 그대로 저장 (manual). 없으면 routePlanningMachine 을 통해 routing service 를 invoke 하고
   * 성공 시 반환된 hops 로 route plan 을 upsert (auto).
   */
  async execute(command: PlanRouteCommand): Promise<PlanRouteResult> {
    const { shipmentId } = command.props;

    const shipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
      select: {
        originHubId: true,
        destinationHubId: true,
        originHub: { select: { code: true } },
        destinationHub: { select: { code: true } },
      },
    });
    if (!shipment) throw new AppException(SHIPMENT_ERRORS.NOT_FOUND);
    if (shipment.originHubId === shipment.destinationHubId) {
      throw new AppException(SHIPMENT_ERRORS.ORIGIN_EQUALS_DESTINATION);
    }

    let hops: string[];
    let etaMinutes: number | null = null;
    let source: 'manual' | 'auto';

    if (command.props.hops && command.props.hops.length >= 2) {
      hops = command.props.hops;
      source = 'manual';
    } else {
      const planning = await runRoutePlanning(this.routingService, {
        originCode: shipment.originHub.code,
        destinationCode: shipment.destinationHub.code,
      });

      if (planning.status !== 'planned') {
        throw new AppException(SHIPMENT_ERRORS.ROUTING_FAILED);
      }

      hops = planning.hops;
      etaMinutes = planning.etaMinutes;
      source = 'auto';
    }

    await this.prisma.routePlan.upsert({
      where: { shipmentId },
      create: { shipmentId, hops, currentHopIndex: 0 },
      update: { hops, currentHopIndex: 0 },
    });

    return { shipmentId, hops, totalHops: hops.length, etaMinutes, source };
  }
}
