import { PrismaService } from '@@db';
import { AppException } from '@@exceptions';
import { RoutingService, runRoutePlanning } from '@@state-machines';
import { Command, CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { isDefined } from 'class-validator';

import { SHIPMENT_ERRORS } from '../../shipment.error';

export class PlanRouteCommand extends Command<PlanRouteResult> {
  constructor(public readonly props: PlanRouteCommandProps) {
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
   * 성공 시 반환된 hops 로 route plan 을 upsert (auto)
   *
   * @param {PlanRouteCommand} command 라우팅 계획 커맨드
   * @returns {Promise<PlanRouteResult>} 저장된 라우팅 계획 요약
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

    if (!isDefined(shipment)) {
      throw new AppException(SHIPMENT_ERRORS.NOT_FOUND);
    }

    if (shipment.originHubId === shipment.destinationHubId) {
      throw new AppException(SHIPMENT_ERRORS.ORIGIN_EQUALS_DESTINATION);
    }

    const plan = await this.resolveRoutePlan(command.props.hops, shipment.originHub.code, shipment.destinationHub.code);

    await this.prisma.routePlan.upsert({
      where: { shipmentId },
      create: { shipmentId, hops: plan.hops, currentHopIndex: 0 },
      update: { hops: plan.hops, currentHopIndex: 0 },
    });

    return {
      shipmentId,
      hops: plan.hops,
      totalHops: plan.hops.length,
      etaMinutes: plan.etaMinutes,
      source: plan.source,
    };
  }

  /**
   * manual hops 가 유효하면 그대로, 아니면 routing service 로 자동 계획 조회
   *
   * @param {string[]} [manualHops] 수동 지정된 hop 배열
   * @param {string} originCode 출발 허브 코드
   * @param {string} destinationCode 도착 허브 코드
   * @returns {Promise<ResolvedRoutePlan>} 결정된 hops / eta / source
   */
  private async resolveRoutePlan(
    manualHops: string[] | undefined,
    originCode: string,
    destinationCode: string,
  ): Promise<ResolvedRoutePlan> {
    if (isDefined(manualHops) && manualHops.length >= 2) {
      return { hops: manualHops, etaMinutes: null, source: 'manual' };
    }

    const planning = await runRoutePlanning(this.routingService, { originCode, destinationCode });

    if (planning.status !== 'planned') {
      throw new AppException(SHIPMENT_ERRORS.ROUTING_FAILED);
    }

    return { hops: planning.hops, etaMinutes: planning.etaMinutes, source: 'auto' };
  }
}

interface PlanRouteResult {
  shipmentId: number;
  hops: string[];
  totalHops: number;
  etaMinutes: number | null;
  source: 'manual' | 'auto';
}

interface PlanRouteCommandProps {
  shipmentId: number;
  hops?: string[];
}

interface ResolvedRoutePlan {
  hops: string[];
  etaMinutes: number | null;
  source: 'manual' | 'auto';
}
