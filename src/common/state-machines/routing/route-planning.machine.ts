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
 * RoutingService 를 closure 로 잡아 machine 을 생성한다.
 *
 * 이렇게 factory 로 감싸는 이유:
 *   - machine 정의 자체는 순수하게 유지하고 싶은데, invoke 로 호출할 실제 구현체는 런타임에 주입해야 함
 *   - context 에 함수를 밀어넣는 트릭 없이 fromPromise 클로저로 서비스에 접근
 *
 * 흐름:
 *   idle → PLAN → planning
 *     ├─ (Promise resolve)  → planned (final)     context.hops / etaMinutes 세팅
 *     └─ (Promise reject)   → failed              context.error 세팅, RETRY 로 재시도 가능
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
          if ('output' in event) return (event.output as IRoutingResponse).hops;
          return [];
        },
        etaMinutes: ({ event }) => {
          if ('output' in event) return (event.output as IRoutingResponse).etaMinutes;
          return null;
        },
        error: () => null,
      }),
      applyError: assign({
        error: ({ event }) => {
          if ('error' in event) return (event.error as Error)?.message ?? 'Unknown routing error';
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
