import { assign, fromPromise, setup } from 'xstate';

import type { IRoutingResponse, RoutingService } from './routing.service';

export interface RoutePlanningContext {
  originCode: string;
  destinationCode: string;
  hops: string[];
  etaMinutes: number | null;
  error: string | null;
}

export type RoutePlanningInput = {
  originCode: string;
  destinationCode: string;
};

/**
 * RoutingService 를 closure 로 잡아 route planning state machine 을 생성. invoke 로 호출할 실제 구현체를 런타임에 주입하기 위한 factory
 *
 * @param {RoutingService} routingService 외부 라우팅 호출 서비스
 * @returns {ReturnType<typeof setup>['createMachine']} route planning machine
 */
export const createRoutePlanningMachine = (routingService: RoutingService) =>
  setup({
    types: {
      context: {} as RoutePlanningContext,
      events: {} as { type: 'PLAN' } | { type: 'RETRY' },
      input: {} as RoutePlanningInput,
    },
    actors: {
      callRoutingApi: fromPromise<IRoutingResponse, RoutePlanningInput>(async ({ input }) =>
        routingService.suggestRoute({ originCode: input.originCode, destinationCode: input.destinationCode }),
      ),
    },
    actions: {
      applyPlan: assign({
        hops: ({ event }) => {
          if ('output' in event) {
            return (event.output as IRoutingResponse).hops;
          }

          return [];
        },
        etaMinutes: ({ event }) => {
          if ('output' in event) {
            return (event.output as IRoutingResponse).etaMinutes;
          }

          return null;
        },
        error: () => null,
      }),
      applyError: assign({
        error: ({ event }) => {
          if ('error' in event) {
            return (event.error as Error)?.message ?? 'Unknown routing error';
          }

          return 'Unknown routing error';
        },
      }),
    },
  }).createMachine({
    id: 'routePlanning',
    initial: 'idle',
    context: ({ input }) => ({
      originCode: input.originCode,
      destinationCode: input.destinationCode,
      hops: [],
      etaMinutes: null,
      error: null,
    }),
    states: {
      idle: {
        on: { PLAN: { target: 'planning' } },
      },
      planning: {
        invoke: {
          src: 'callRoutingApi',
          input: ({ context }) => ({
            originCode: context.originCode,
            destinationCode: context.destinationCode,
          }),
          onDone: { target: 'planned', actions: { type: 'applyPlan' } },
          onError: { target: 'failed', actions: { type: 'applyError' } },
        },
      },
      planned: { type: 'final' },
      failed: {
        on: { RETRY: { target: 'planning' } },
      },
    },
  });
