import { assign, setup } from 'xstate';

export type ShipmentMachineState =
  | 'CREATED'
  | 'READY_FOR_PICKUP'
  | 'PICKED_UP'
  | 'AT_ORIGIN_HUB'
  | 'IN_TRANSIT'
  | 'AT_HUB'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'DELIVERY_FAILED'
  | 'RETURNED'
  | 'CANCELLED';

export interface ShipmentMachineContext {
  driverId: number | null;
  currentHopIndex: number;
  totalHops: number;
  failureCount: number;
  maxRetries: number;
}

export type ShipmentEventInput =
  | { type: 'REQUEST_PICKUP' }
  | { type: 'ASSIGN_PICKUP_DRIVER'; driverId: number }
  | { type: 'MARK_PICKED_UP' }
  | { type: 'ARRIVE_AT_ORIGIN_HUB' }
  | { type: 'DISPATCH_LINE_HAUL' }
  | { type: 'ARRIVE_AT_HUB' }
  | { type: 'DISPATCH_LAST_MILE'; driverId: number }
  | { type: 'DELIVER'; proofUrl: string }
  | { type: 'FAIL_DELIVERY'; reason: string }
  | { type: 'RETRY_DELIVERY' }
  | { type: 'RETURN' }
  | { type: 'CANCEL' };

/**
 * Shipment lifecycle state machine.
 *
 * 순수 상태 전이만 담당. DB 저장 / Kafka 발행 같은 부수효과는 UseCase 레이어에서 처리한다.
 * 여기서 정의한 guard/context 로 "이 전이가 지금 valid한지"만 결정한다.
 */
export const shipmentMachine = setup({
  types: {
    context: {} as ShipmentMachineContext,
    events: {} as ShipmentEventInput,
    input: {} as Partial<ShipmentMachineContext>,
  },
  guards: {
    hasPickupDriver: ({ context }) => context.driverId !== null,
    hasReachedFinalHub: ({ context }) => context.currentHopIndex >= context.totalHops - 1,
    hasMoreHops: ({ context }) => context.currentHopIndex < context.totalHops - 1,
    canRetryDelivery: ({ context }) => context.failureCount < context.maxRetries,
  },
  actions: {
    assignDriver: assign({
      driverId: ({ event }) => {
        if (event.type === 'ASSIGN_PICKUP_DRIVER' || event.type === 'DISPATCH_LAST_MILE') {
          return event.driverId;
        }
        return null;
      },
    }),
    clearDriver: assign({ driverId: () => null }),
    incrementHop: assign({ currentHopIndex: ({ context }) => context.currentHopIndex + 1 }),
    incrementFailure: assign({ failureCount: ({ context }) => context.failureCount + 1 }),
  },
}).createMachine({
  id: 'shipment',
  initial: 'CREATED',
  context: ({ input }) => ({
    driverId: input.driverId ?? null,
    currentHopIndex: input.currentHopIndex ?? 0,
    totalHops: input.totalHops ?? 1,
    failureCount: input.failureCount ?? 0,
    maxRetries: input.maxRetries ?? 2,
  }),
  states: {
    CREATED: {
      on: {
        REQUEST_PICKUP: { target: 'READY_FOR_PICKUP' },
        CANCEL: { target: 'CANCELLED' },
      },
    },
    READY_FOR_PICKUP: {
      on: {
        ASSIGN_PICKUP_DRIVER: { actions: { type: 'assignDriver' } },
        MARK_PICKED_UP: {
          guard: 'hasPickupDriver',
          target: 'PICKED_UP',
        },
        CANCEL: { target: 'CANCELLED', actions: { type: 'clearDriver' } },
      },
    },
    PICKED_UP: {
      on: {
        ARRIVE_AT_ORIGIN_HUB: {
          target: 'AT_ORIGIN_HUB',
          actions: { type: 'clearDriver' },
        },
      },
    },
    AT_ORIGIN_HUB: {
      on: {
        DISPATCH_LINE_HAUL: { target: 'IN_TRANSIT' },
      },
    },
    IN_TRANSIT: {
      on: {
        ARRIVE_AT_HUB: {
          target: 'AT_HUB',
          actions: { type: 'incrementHop' },
        },
      },
    },
    AT_HUB: {
      always: [{ guard: 'hasReachedFinalHub', target: 'OUT_FOR_DELIVERY' }],
      on: {
        DISPATCH_LINE_HAUL: {
          guard: 'hasMoreHops',
          target: 'IN_TRANSIT',
        },
        DISPATCH_LAST_MILE: {
          guard: 'hasReachedFinalHub',
          target: 'OUT_FOR_DELIVERY',
          actions: { type: 'assignDriver' },
        },
      },
    },
    OUT_FOR_DELIVERY: {
      on: {
        DELIVER: { target: 'DELIVERED' },
        FAIL_DELIVERY: {
          target: 'DELIVERY_FAILED',
          actions: { type: 'incrementFailure' },
        },
      },
    },
    DELIVERY_FAILED: {
      on: {
        RETRY_DELIVERY: {
          guard: 'canRetryDelivery',
          target: 'OUT_FOR_DELIVERY',
        },
        RETURN: { target: 'RETURNED' },
      },
    },
    DELIVERED: { type: 'final' },
    RETURNED: { type: 'final' },
    CANCELLED: { type: 'final' },
  },
});
