import { createActor, waitFor } from 'xstate';

import { getShipmentInspector } from '../inspector';
import { createRoutePlanningMachine } from './route-planning.machine';
import type { IRoutingRequest, RoutingService } from './routing.service';

export interface IRoutePlanningResult {
  status: 'planned' | 'failed';
  hops: string[];
  etaMinutes: number | null;
  error: string | null;
}

/**
 * routePlanningMachine 을 spawn 해서 최종 상태(planned/failed) 까지 실행한다.
 *
 * 이 유틸의 존재 이유:
 *   - PlanRouteUseCase 가 XState actor lifecycle 을 몰라도 되도록 감싸는 얇은 어댑터
 *   - waitFor 로 promise-friendly API 제공
 */
export const runRoutePlanning = async (
  routingService: RoutingService,
  req: IRoutingRequest,
): Promise<IRoutePlanningResult> => {
  const machine = createRoutePlanningMachine(routingService);
  const inspect = getShipmentInspector();

  const actor = createActor(machine, {
    input: { originCode: req.originCode, destinationCode: req.destinationCode },
    inspect,
  });

  actor.start();
  actor.send({ type: 'PLAN' });

  const finalSnapshot = await waitFor(actor, (snap) => snap.status === 'done' || snap.value === 'failed', {
    timeout: 5_000,
  });
  actor.stop();

  const value = finalSnapshot.value as 'planned' | 'failed';
  return {
    status: value,
    hops: finalSnapshot.context.hops,
    etaMinutes: finalSnapshot.context.etaMinutes,
    error: finalSnapshot.context.error,
  };
};
