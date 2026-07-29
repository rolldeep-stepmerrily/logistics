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
 * OUT_FOR_DELIVERY 의 nested sub-state.
 * status = 'OUT_FOR_DELIVERY' 일 때만 의미 있음. 그 외 상태에서는 null.
 */
export type ShipmentDeliveryPhase = 'EN_ROUTE' | 'AT_DOOR';

/**
 * Delivery 서브머신의 snapshot value.
 * OUT_FOR_DELIVERY 는 compound state 라 object shape 이 됨: `{ OUT_FOR_DELIVERY: 'EN_ROUTE' }`.
 * 나머지 flat state 는 string.
 */
export type ShipmentDeliveryValue =
  | Exclude<ShipmentDeliveryState, 'OUT_FOR_DELIVERY'>
  // biome-ignore lint/style/useNamingConvention: XState state ID 와 일치해야 함
  | { OUT_FOR_DELIVERY: ShipmentDeliveryPhase };

/**
 * parallel machine 의 최상위 value 는 sub-state 이름을 키로 갖는 object.
 * shipmentMachine 의 snapshot.value 는 이 shape 을 갖는다.
 */
export interface ShipmentMachineValue {
  delivery: ShipmentDeliveryValue;
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
  // Entry/Exit action 이 갱신하는 SLA 타임스탬프
  deliveryStartedAt: Date | null;
  arrivedAtDoorAt: Date | null;
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
  | { type: 'REFUND_PAYMENT' }
  | { type: 'ARRIVE_AT_DOOR' }
  | { type: 'TIMEOUT_DELIVERY' };

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
        if (event.type === 'CONFIRM_PAYMENT') {
          return event.amount;
        }

        return null;
      },
    }),
    // Entry action on OUT_FOR_DELIVERY 진입 시 배송 시작 타임스탬프 기록
    markDeliveryStart: assign({ deliveryStartedAt: () => new Date() }),
    // Exit action on OUT_FOR_DELIVERY 이탈 시 (성공/실패/취소 무관) 타임스탬프 정리
    clearDeliveryTimers: assign({
      deliveryStartedAt: () => null,
      arrivedAtDoorAt: () => null,
    }),
    // Entry action on AT_DOOR 진입 — 문 앞 도착 시각 기록. after timeout 계산의 기준점.
    markArrivedAtDoor: assign({ arrivedAtDoorAt: () => new Date() }),
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
    deliveryStartedAt: input.deliveryStartedAt ?? null,
    arrivedAtDoorAt: input.arrivedAtDoorAt ?? null,
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
          // Entry action — 상태 진입 시 배송 시작 타임스탬프 기록 (transition 종류 무관)
          entry: { type: 'markDeliveryStart' },
          // Exit action — 상태 이탈 시 (DELIVER / FAIL_DELIVERY / TIMEOUT_DELIVERY / CANCEL 등) 타이머 정리
          exit: { type: 'clearDeliveryTimers' },
          initial: 'EN_ROUTE',
          on: {
            DELIVER: {
              guard: 'isPaid',
              target: 'DELIVERED',
            },
            FAIL_DELIVERY: {
              target: 'DELIVERY_FAILED',
              actions: { type: 'incrementFailure' },
            },
            // Cron 이 dispatch — arrivedAtDoorAt 이 timeout 넘긴 shipment 에 대해 실행
            TIMEOUT_DELIVERY: {
              target: 'DELIVERY_FAILED',
              actions: { type: 'incrementFailure' },
            },
          },
          states: {
            EN_ROUTE: {
              on: {
                ARRIVE_AT_DOOR: { target: 'AT_DOOR' },
              },
            },
            AT_DOOR: {
              // Entry action — 문 앞 도착 시각 기록. after / cron timeout 의 기준점.
              entry: { type: 'markArrivedAtDoor' },
              // ⚠️ `after` 는 XState 의 delayed transition — actor 가 살아있는 동안에만 fire 된다.
              // 이 프로젝트는 runTransition 이 매 요청마다 actor 를 만들고 stop 하므로 실제로는 안 fire.
              // 선언 자체는 (1) 도메인 의도 문서화, (2) Stately Inspector 시각화 목적.
              // 실제 timeout 은 DeliveryTimeoutService (@Cron) 가 TIMEOUT_DELIVERY 이벤트로 dispatch.
              after: {
                900000: {
                  target: '#deliveryFailed',
                  actions: { type: 'incrementFailure' },
                },
              },
            },
          },
        },
        DELIVERY_FAILED: {
          id: 'deliveryFailed',
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
