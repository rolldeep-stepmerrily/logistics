import { assign, setup, stateIn } from 'xstate';

export type ShipmentDeliveryState =
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

export type ShipmentPaymentState = 'PENDING' | 'PAID' | 'REFUNDED';

/**
 * parallel machine 의 최상위 value 는 sub-state 이름을 키로 갖는 object.
 * shipmentMachine 의 snapshot.value 는 이 shape 을 갖는다.
 */
export interface ShipmentMachineValue {
  delivery: ShipmentDeliveryState;
  payment: ShipmentPaymentState;
}

/**
 * 하위 호환 alias — 예전 코드가 단일 delivery state 만 참조할 때 사용.
 */
export type ShipmentMachineState = ShipmentDeliveryState;

export interface ShipmentMachineContext {
  driverId: number | null;
  currentHopIndex: number;
  totalHops: number;
  failureCount: number;
  maxRetries: number;
  paidAmount: number | null;
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
  | { type: 'CANCEL' }
  | { type: 'CONFIRM_PAYMENT'; amount: number }
  | { type: 'REFUND_PAYMENT' };

/**
 * Shipment lifecycle state machine — parallel state 로 delivery + payment 를 동시에 트래킹.
 *
 * ```
 * shipment (parallel)
 *   ├── delivery : CREATED → ... → DELIVERED / RETURNED / CANCELLED
 *   └── payment  : PENDING → PAID → REFUNDED
 * ```
 *
 * Cross-substate coordination:
 *   - DELIVER 는 payment.PAID 상태여야만 허용 (guard: `stateIn`)
 *   - 두 서브머신은 독립적으로 이벤트를 받되, 각각의 이벤트가 반대편에 영향을 줄 수 있다
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
    isPaid: stateIn({ payment: 'PAID' }),
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
    recordPayment: assign({
      paidAmount: ({ event }) => {
        if (event.type === 'CONFIRM_PAYMENT') return event.amount;
        return null;
      },
    }),
  },
}).createMachine({
  id: 'shipment',
  type: 'parallel',
  context: ({ input }) => ({
    driverId: input.driverId ?? null,
    currentHopIndex: input.currentHopIndex ?? 0,
    totalHops: input.totalHops ?? 1,
    failureCount: input.failureCount ?? 0,
    maxRetries: input.maxRetries ?? 2,
    paidAmount: input.paidAmount ?? null,
  }),
  states: {
    delivery: {
      initial: 'CREATED',
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
            DELIVER: {
              guard: 'isPaid',
              target: 'DELIVERED',
            },
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
    },
    payment: {
      initial: 'PENDING',
      states: {
        PENDING: {
          on: {
            CONFIRM_PAYMENT: {
              target: 'PAID',
              actions: { type: 'recordPayment' },
            },
          },
        },
        PAID: {
          on: {
            REFUND_PAYMENT: { target: 'REFUNDED' },
          },
        },
        REFUNDED: { type: 'final' },
      },
    },
  },
});
