# State Machine 이해하기 — `shipmentMachine` 을 예제로

> XState v5 기반 배송 도메인 상태 머신 학습 노트.
> 참고 파일:
> - `src/common/state-machines/shipment/shipment.machine.ts`
> - `src/common/state-machines/shipment/shipment-machine.util.ts`
> - `src/common/state-machines/routing/route-planning.machine.ts`
> - `src/common/state-machines/inspector.ts`
> - `src/common/outbox/outbox-publisher.service.ts`
> - `src/shipment/application/commands/transition-shipment.command.ts`

---

## 목차

### 기초편

1. [왜 State Machine 인가](#1-왜-state-machine-인가)
2. [핵심 5개념 — State / Event / Context / Guard / Action](#2-핵심-5개념--state--event--context--guard--action)
3. [XState 특유의 패턴 두 가지](#3-xstate-특유의-패턴-두-가지)
4. [순수 머신 ↔ 부수효과 3계층 분리](#4-순수-머신--부수효과-3계층-분리)
5. [전체 전이 다이어그램](#5-전체-전이-다이어그램)
6. [End-to-end 시나리오 walkthrough](#6-end-to-end-시나리오-walkthrough)
7. [테스트 관점 — 왜 이렇게 짜면 편한가](#7-테스트-관점--왜-이렇게-짜면-편한가)

### 심화편

8. [고급 패턴 A — Parallel State (delivery + payment)](#8-고급-패턴-a--parallel-state-delivery--payment)
9. [고급 패턴 B — invoke + fromPromise (외부 API 를 머신 안에서)](#9-고급-패턴-b--invoke--frompromise-외부-api-를-머신-안에서)
10. [고급 패턴 C — Outbox 패턴 (상태 전이 → Kafka)](#10-고급-패턴-c--outbox-패턴-상태-전이--kafka)
11. [고급 패턴 D — Stately Inspect (dev 시각화)](#11-고급-패턴-d--stately-inspect-dev-시각화)
12. [고급 패턴 E — Nested (Compound) States](#12-고급-패턴-e--nested-compound-states)
13. [고급 패턴 F — Entry / Exit Actions](#13-고급-패턴-f--entry--exit-actions)
14. [고급 패턴 G — `after` (Delayed Transitions) + Cron 스캐너 패턴](#14-고급-패턴-g--after-delayed-transitions--cron-스캐너-패턴)
15. [한눈 정리](#15-한눈-정리)

---

## 1. 왜 State Machine 인가

### 문제 상황: 상태 로직이 코드베이스 전체에 흩어진다

```ts
// 여기저기 흩어진 방어 코드 (안티패턴)
if (shipment.status === 'READY_FOR_PICKUP' && shipment.driverId && !shipment.cancelledAt) {
  shipment.status = 'PICKED_UP';
}
if (shipment.status === 'DELIVERED') {
  throw new Error('Cannot cancel delivered shipment');
}
if (shipment.status === 'DELIVERY_FAILED' && shipment.failureCount < 2) {
  // 재시도 가능
}
```

- "이 상태에서 이 이벤트가 유효한가?" 라는 질문의 답이 여러 파일에 흩어진다
- 새로운 상태 하나 추가할 때 놓치는 곳이 반드시 생긴다
- 잘못된 전이(`DELIVERED → CANCELLED` 같은 것)를 코드로 일일이 막아야 한다

### 해결: 전이 규칙을 표 하나로 몰아넣기

State Machine 은 **"어떤 상태에서 + 어떤 이벤트가 오면 + 어떤 다음 상태로 갈지"** 를 선언적으로 정의한 표다.

- ✅ 규칙이 **한 파일** 에 모인다 (`shipment.machine.ts`)
- ✅ 정의되지 않은 전이는 **자동으로 거절** 된다 → 방어 코드 불필요
- ✅ 도메인이 곧 코드 — enum 이름만 훑어도 lifecycle 이 이해된다

---

## 2. 핵심 5개념 — State / Event / Context / Guard / Action

> 아래 예시는 delivery 서브머신을 기준으로 설명한다. Payment 서브머신 및 parallel 구조는 [8장](#8-고급-패턴-a--parallel-state-delivery--payment)에서 다룬다.

### ① State — "지금 어디에 있나"

`shipment.machine.ts:3~16`

```ts
export type ShipmentDeliveryState =
  | 'CREATED'
  | 'READY_FOR_PICKUP'
  | 'PICKED_UP'
  | 'AT_ORIGIN_HUB'
  | 'IN_TRANSIT'
  | 'AT_HUB'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'          // final
  | 'DELIVERY_FAILED'
  | 'RETURNED'           // final
  | 'CANCELLED';         // final

export type ShipmentPaymentState = 'PENDING' | 'PAID' | 'REFUNDED';
```

`type: 'final'` 로 표시된 상태는 **더 이상 이벤트를 받지 않는다**. 완료된 배송에 다시 취소를 시도해도 머신이 튕겨낸다.

### ② Event — "무슨 일이 벌어졌나"

`shipment.machine.ts:41~55`

```ts
export type ShipmentEventInput =
  | { type: 'REQUEST_PICKUP' }
  | { type: 'ASSIGN_PICKUP_DRIVER'; driverId: number }
  | { type: 'MARK_PICKED_UP' }
  | { type: 'DISPATCH_LAST_MILE'; driverId: number }
  | { type: 'DELIVER'; proofUrl: string }
  | { type: 'FAIL_DELIVERY'; reason: string }
  | { type: 'CONFIRM_PAYMENT'; amount: number }
  | { type: 'REFUND_PAYMENT' }
  // ...
```

**Discriminated union** 이라 이벤트 종류마다 payload 스키마가 다르다. TypeScript 가 `event.type === 'DELIVER'` 인 브랜치에서만 `event.proofUrl` 접근을 허용해준다.

### ③ Context — "머신이 기억해야 할 데이터"

`shipment.machine.ts:32~39`

```ts
export interface ShipmentMachineContext {
  driverId: number | null;
  currentHopIndex: number;
  totalHops: number;
  failureCount: number;
  maxRetries: number;
  paidAmount: number | null;
}
```

**상태값(status) 만으로는 표현이 불가능한 정보** 를 담는 자리.
예: "지금 `IN_TRANSIT` 인데 몇 번째 hub 로 가는 중인지" → `currentHopIndex` 로만 알 수 있다.

### ④ Guard — "이 전이가 지금 유효한가"

`shipment.machine.ts:76~82`

```ts
guards: {
  hasPickupDriver: ({ context }) => context.driverId !== null,
  hasReachedFinalHub: ({ context }) => context.currentHopIndex >= context.totalHops - 1,
  hasMoreHops: ({ context }) => context.currentHopIndex < context.totalHops - 1,
  canRetryDelivery: ({ context }) => context.failureCount < context.maxRetries,
  isPaid: stateIn({ payment: 'PAID' }),  // ← cross-substate guard, 8장 참고
}
```

**예시** — `shipment.machine.ts:130~139`

```ts
READY_FOR_PICKUP: {
  on: {
    ASSIGN_PICKUP_DRIVER: { actions: { type: 'assignDriver' } },
    MARK_PICKED_UP: {
      guard: 'hasPickupDriver',   // ← driver 배정 안 됐으면 전이 거절
      target: 'PICKED_UP',
    },
    CANCEL: { target: 'CANCELLED', actions: { type: 'clearDriver' } },
  },
},
```

driver 없이 픽업 완료를 시도하면 머신이 조용히 전이를 거부한다 (같은 상태 유지). 호출자는 `changed === false` 를 보고 `INVALID_TRANSITION` 예외를 던진다.

### ⑤ Action — "전이 순간에 context 를 어떻게 바꿀 것인가"

`shipment.machine.ts:83~101`

```ts
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
    paidAmount: ({ event }) => (event.type === 'CONFIRM_PAYMENT' ? event.amount : null),
  }),
}
```

> ⚠️ **중요 원칙**: action 은 **머신 내부 context** 만 바꾼다.
> DB update, Kafka publish 같은 부수효과는 **절대 여기 넣지 않는다**. (→ [4장 참고](#4-순수-머신--부수효과-3계층-분리))

---

## 3. XState 특유의 패턴 두 가지

### 3.1 `always` — 조건부 자동 전이

`shipment.machine.ts:161~174`

```ts
AT_HUB: {
  always: [{ guard: 'hasReachedFinalHub', target: 'OUT_FOR_DELIVERY' }],
  on: {
    DISPATCH_LINE_HAUL: { guard: 'hasMoreHops', target: 'IN_TRANSIT' },
    DISPATCH_LAST_MILE: {
      guard: 'hasReachedFinalHub',
      target: 'OUT_FOR_DELIVERY',
      actions: { type: 'assignDriver' },
    },
  },
},
```

**의미**: "허브 도착 이벤트로 `AT_HUB` 에 진입하는 순간, 이미 마지막 허브라면 이벤트 없이 즉시 `OUT_FOR_DELIVERY` 로 자동 전이하라."

`always` 는 상태에 들어오는 순간 guard 를 평가해서 참이면 곧바로 다음 상태로 넘어간다. `if/else` 분기를 머신 문법으로 표현한 것.

### 3.2 Self-transition — 상태 유지, context 만 갱신

`shipment.machine.ts:132`

```ts
ASSIGN_PICKUP_DRIVER: { actions: { type: 'assignDriver' } },  // ← target 없음
```

`READY_FOR_PICKUP` 상태를 그대로 유지하면서 `context.driverId` 만 채운다. 이후 `MARK_PICKED_UP` 이 왔을 때 `hasPickupDriver` guard 가 통과할 수 있게 됨.

> "상태는 안 바뀌지만 데이터는 바뀌는 이벤트" 를 표현하는 관용구.

---

## 4. 순수 머신 ↔ 부수효과 3계층 분리

이 프로젝트의 **핵심 학습 포인트**. 세 개의 레이어가 명확히 역할을 나눈다.

```
┌────────────────────────────────────────────────────────┐
│ Layer 3 — Command Handler (트랜잭션, DB, Kafka)         │
│   transition-shipment.command.ts                        │
│   • shipment.status / paymentStatus 업데이트             │
│   • ShipmentEvent append + OutboxEvent append            │
│   • Driver / RoutePlan / currentHub 부수효과              │
└────────────────────────────────────────────────────────┘
                       ▲ uses
┌────────────────────────────────────────────────────────┐
│ Layer 2 — Transition Runner (util)                      │
│   shipment-machine.util.ts                              │
│   • snapshot 복원 → 이벤트 send → 다음 상태 반환             │
│   • DB 몰라도 됨                                          │
└────────────────────────────────────────────────────────┘
                       ▲ uses
┌────────────────────────────────────────────────────────┐
│ Layer 1 — Pure State Machine                            │
│   shipment.machine.ts                                   │
│   • 상태 / 이벤트 / guard / action 만                     │
│   • 완전히 pure, side-effect 0                            │
└────────────────────────────────────────────────────────┘
```

### Layer 1 — 순수 머신

`shipment.machine.ts` 는 DB, Kafka, HTTP 를 **아무것도 모른다**. "현재 상태 + 이벤트 + context → 다음 상태 + 새 context" 만 계산.

→ **테스트가 미치도록 쉽다.** 어떤 fixture DB도 필요 없다.

### Layer 2 — `runTransition` 유틸

`shipment-machine.util.ts:52~81`

```ts
export const runTransition = ({
  currentDelivery,
  currentPayment,
  context,
  event,
}: ITransitionInput): ITransitionResult => {
  const snapshot = resolveShipmentSnapshot(currentDelivery, currentPayment, context);
  const inspect = getShipmentInspector();
  const actor = createActor(shipmentMachine, { snapshot, input: context, inspect });
  actor.start();
  actor.send(event);
  const next = actor.getSnapshot();
  actor.stop();

  const value = next.value as ShipmentMachineValue;      // { delivery, payment }
  const deliveryChanged = value.delivery !== currentDelivery;
  const paymentChanged = value.payment !== currentPayment;

  return {
    nextDelivery: value.delivery,
    nextPayment: value.payment,
    context: next.context,
    deliveryChanged,
    paymentChanged,
    changed: deliveryChanged || paymentChanged,
  };
};
```

DB 에서 읽어온 (delivery, payment, context) 로 머신 스냅샷을 복원 → 이벤트 발사 → 결과 스냅샷 반환.
`changed` 로 "delivery/payment 중 하나라도 실제로 전이됐는지" 를 알려줘서, 호출자가 guard 실패를 감지할 수 있게 함.

### Layer 3 — Command Handler 가 트랜잭션 조립

`transition-shipment.command.ts:62~144`

```ts
async execute(command: TransitionShipmentCommand): Promise<TransitionShipmentResult> {
  return await this.prisma.$transaction(async (tx) => {
    // 1) shipment 로드 → context 조립
    const shipment = await tx.shipment.findUnique({ ... });
    const context = {
      driverId: shipment.assignments.at(0)?.driverId ?? null,
      currentHopIndex: shipment.routePlan?.currentHopIndex ?? 0,
      // ...
      paidAmount: shipment.paidAmount ?? null,
    };

    // 2) 머신으로 다음 상태 계산 (pure)
    const result = runTransition({
      currentDelivery: shipment.status,
      currentPayment: shipment.paymentStatus,
      context,
      event,
    });

    // 3) 전이 거절 시 예외
    if (!result.changed) throw new AppException(SHIPMENT_ERRORS.INVALID_TRANSITION);

    // 4) 부수효과 계산 (driver / routePlan / hub 갱신)
    const patch = await this.buildSideEffects({ ... });

    // 5) shipment 업데이트 + ShipmentEvent 이력 + OutboxEvent (같은 트랜잭션)
    await tx.shipment.update({
      where: { id: shipmentId },
      data: { status: nextDelivery, paymentStatus: nextPayment, ...patch },
    });
    await tx.shipmentEvent.create({ ... });
    await tx.outboxEvent.create({ ... });   // ← 10장 Outbox 참고
  });
}
```

**규칙**: 상태 전이는 **오직 이 command 를 통해서만**. 다른 곳에서 `shipment.status` / `shipment.paymentStatus` 직접 update 금지.

### 왜 이 3계층 분리가 좋은가

| 이점 | 설명 |
|---|---|
| 테스트 격리 | Layer 1 은 pure function 테스트로 100% 커버 가능 |
| 부수효과 원자성 | Layer 3 이 하나의 `$transaction` 안에서 DB + 이력 + driver 상태 + outbox 를 함께 커밋 |
| 이벤트 소싱 자연스러움 | 모든 전이가 `ShipmentEvent` + `OutboxEvent` 에 append-only 로 남음 → 감사 로그/외부 발행 무료 |
| 도메인 규칙 변경 로컬화 | "재시도 3회로 늘림" → `maxRetries` 만 바꿈, DB 코드는 손 안 댐 |

---

## 5. 전체 전이 다이어그램

> Delivery 서브머신만 표시. Payment 서브머신은 [8장](#8-고급-패턴-a--parallel-state-delivery--payment) 참고.

```
                    ┌─────────┐
                    │ CREATED │
                    └────┬────┘
              REQUEST_PICKUP │  ╲ CANCEL
                    ┌────────▼──╲────────────┐
                    │ READY_FOR_PICKUP        │──ASSIGN_PICKUP_DRIVER (self)
                    └────┬───────────┬────────┘
       MARK_PICKED_UP     │           │ CANCEL
       [hasPickupDriver]  │           └────────────────┐
                    ┌─────▼─────┐                       │
                    │ PICKED_UP │                       │
                    └─────┬─────┘                       │
       ARRIVE_AT_ORIGIN_HUB │                           │
                    ┌───────▼───────┐                   │
                    │ AT_ORIGIN_HUB │                   │
                    └───────┬───────┘                   │
        DISPATCH_LINE_HAUL  │                           │
                    ┌───────▼──────┐                    │
             ┌─────►│ IN_TRANSIT   │                    │
             │      └───────┬──────┘                    │
             │      ARRIVE_AT_HUB (incrementHop)        │
             │              │                           │
             │      ┌───────▼──────┐                    │
             │      │  AT_HUB      │                    │
             │      └───┬────┬─────┘                    │
DISPATCH_LINE_HAUL     │    │  always [hasReachedFinalHub]
[hasMoreHops]          │    │  또는 DISPATCH_LAST_MILE   │
             └────────┘    │  [hasReachedFinalHub]      │
                            ▼                            │
                    ┌──────────────────┐                 │
                    │ OUT_FOR_DELIVERY │◄────┐           │
                    └───┬──────────┬───┘     │           │
    DELIVER [isPaid]    │          │ FAIL_DELIVERY        │
                        │          │ (incrementFailure)   │
                    ┌───▼────┐  ┌──▼───────────────┐      │
                    │DELIVERED│ │ DELIVERY_FAILED  │      │
                    │ (final) │ └──┬──────────┬────┘      │
                    └────────┘    │          │            │
                    RETRY_DELIVERY│          │RETURN      │
                    [canRetry]────┘          ▼            ▼
                                     ┌──────────┐   ┌──────────┐
                                     │ RETURNED │   │CANCELLED │
                                     │ (final)  │   │ (final)  │
                                     └──────────┘   └──────────┘
```

---

## 6. End-to-end 시나리오 walkthrough

**시나리오**: 서울(HUB_A) → 대전(HUB_B) → 부산(HUB_C) 로 가는 배송, 결제 후 배송 성공.

```
초기 상태:
  DB:      status=CREATED, paymentStatus=PENDING
           routePlan.hops=[HUB_A, HUB_B, HUB_C], currentHopIndex=0
  Context: driverId=null, currentHopIndex=0, totalHops=3, failureCount=0, paidAmount=null

┌─────────────────────────────────────────────────────────────────────────┐
│ Event: REQUEST_PICKUP                                                    │
├─────────────────────────────────────────────────────────────────────────┤
│ Machine   : delivery.CREATED → delivery.READY_FOR_PICKUP                 │
│ Side-fx   : shipment.status = READY_FOR_PICKUP                           │
│           : ShipmentEvent append + OutboxEvent append                     │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ Event: ASSIGN_PICKUP_DRIVER { driverId: 7 }                              │
├─────────────────────────────────────────────────────────────────────────┤
│ Machine   : delivery.READY_FOR_PICKUP (self-transition)                  │
│           : action assignDriver → context.driverId = 7                   │
│ Side-fx   : DriverAssignment(purpose=PICKUP) 생성                         │
│           : Driver(id=7).status = BUSY                                    │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ Event: MARK_PICKED_UP                                                    │
├─────────────────────────────────────────────────────────────────────────┤
│ Guard     : hasPickupDriver → context.driverId !== null → PASS ✅         │
│ Machine   : delivery.READY_FOR_PICKUP → delivery.PICKED_UP               │
└─────────────────────────────────────────────────────────────────────────┘

... (ARRIVE_AT_ORIGIN_HUB, DISPATCH_LINE_HAUL, ARRIVE_AT_HUB × 2 …) ...

┌─────────────────────────────────────────────────────────────────────────┐
│ Event: CONFIRM_PAYMENT { amount: 15000 }                                 │
├─────────────────────────────────────────────────────────────────────────┤
│ Machine   : payment.PENDING → payment.PAID                               │
│           : action recordPayment → context.paidAmount = 15000            │
│ Side-fx   : shipment.paymentStatus = PAID, paidAmount = 15000            │
│ 참고       : delivery 서브머신은 변화 없음 — parallel state 라 독립적       │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ Event: DELIVER { proofUrl: 'https://.../signature.png' }                 │
├─────────────────────────────────────────────────────────────────────────┤
│ Guard     : isPaid = stateIn({payment:'PAID'}) → PASS ✅                  │
│           : (만약 payment 가 PENDING 이었다면 changed=false 로 거절됐음)     │
│ Machine   : delivery.OUT_FOR_DELIVERY → delivery.DELIVERED               │
│ Side-fx   : shipment.currentHub = HUB_C, deliveryProof 저장                │
│           : DriverAssignment(LAST_MILE) → COMPLETED, Driver → AVAILABLE   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 실패 → 재시도 → 반품 시나리오

```
OUT_FOR_DELIVERY (payment=PAID)
  ↓ FAIL_DELIVERY { reason: 'customer absent' }   (incrementFailure → failCount=1)
DELIVERY_FAILED
  ↓ RETRY_DELIVERY  [canRetryDelivery: 1 < 2 ✅]
OUT_FOR_DELIVERY
  ↓ FAIL_DELIVERY { reason: 'address wrong' }     (failCount=2)
DELIVERY_FAILED
  ↓ RETRY_DELIVERY  [canRetryDelivery: 2 < 2 ❌]  → 전이 거절, changed=false
                                                    → INVALID_TRANSITION 예외
  ↓ RETURN
RETURNED (final)
  ↓ REFUND_PAYMENT       ← delivery 는 final 이지만 payment 는 살아있음
payment.REFUNDED (final)
```

---

## 7. 테스트 관점 — 왜 이렇게 짜면 편한가

### Layer 1 (순수 머신) — DB 0줄

```ts
import { runTransition } from '@@state-machines';

const baseContext = {
  driverId: null,
  currentHopIndex: 0,
  totalHops: 1,
  failureCount: 0,
  maxRetries: 2,
  paidAmount: null,
};

describe('shipmentMachine', () => {
  it('driver 없이 픽업 완료 시도하면 전이 거절', () => {
    const result = runTransition({
      currentDelivery: 'READY_FOR_PICKUP',
      currentPayment: 'PENDING',
      context: baseContext,
      event: { type: 'MARK_PICKED_UP' },
    });
    expect(result.changed).toBe(false);
    expect(result.nextDelivery).toBe('READY_FOR_PICKUP');
  });

  it('payment 미완료 상태에서 DELIVER 시도하면 isPaid guard 로 거절', () => {
    const result = runTransition({
      currentDelivery: 'OUT_FOR_DELIVERY',
      currentPayment: 'PENDING',           // ← payment 미완료
      context: baseContext,
      event: { type: 'DELIVER', proofUrl: 'x' },
    });
    expect(result.changed).toBe(false);    // ← cross-substate guard 실패
  });

  it('결제 완료 후 DELIVER 는 성공', () => {
    const result = runTransition({
      currentDelivery: 'OUT_FOR_DELIVERY',
      currentPayment: 'PAID',
      context: baseContext,
      event: { type: 'DELIVER', proofUrl: 'x' },
    });
    expect(result.nextDelivery).toBe('DELIVERED');
  });

  it('CONFIRM_PAYMENT 는 delivery 를 건드리지 않는다', () => {
    const result = runTransition({
      currentDelivery: 'IN_TRANSIT',
      currentPayment: 'PENDING',
      context: baseContext,
      event: { type: 'CONFIRM_PAYMENT', amount: 15000 },
    });
    expect(result.deliveryChanged).toBe(false);
    expect(result.paymentChanged).toBe(true);
    expect(result.nextPayment).toBe('PAID');
  });
});
```

Prisma mock 도, transaction wrapper 도 필요 없음. **도메인 규칙만 검증**한다.

### Layer 3 (부수효과) 는 통합 테스트로

- 실제 DB 에 shipment / driver / routePlan 준비
- Command 를 실행
- shipment.status, ShipmentEvent, OutboxEvent, Driver.status, RoutePlan.currentHopIndex 모두 원자적으로 커밋됐는지 검증

---

# 심화편 — XState 실전 패턴 4가지

## 8. 고급 패턴 A — Parallel State (delivery + payment)

### 문제 상황

"결제 완료" 는 배송 흐름과 **독립적으로 진행되는 별개의 lifecycle** 이다. 이걸 단일 status 하나에 몰아넣으면:
- `IN_TRANSIT_UNPAID`, `IN_TRANSIT_PAID`, `AT_HUB_PAID`, `AT_HUB_UNPAID` … 상태 조합 폭발
- payment 이벤트 하나 늘리면 delivery 상태 N개마다 다 손대야 함

### 해법: `type: 'parallel'`

`shipment.machine.ts:102~213`

```ts
export const shipmentMachine = setup({ ... }).createMachine({
  id: 'shipment',
  type: 'parallel',                     // ← 최상위가 parallel
  states: {
    delivery: {                          // ← 서브머신 1
      initial: 'CREATED',
      states: { CREATED: {...}, READY_FOR_PICKUP: {...}, /* ... */ },
    },
    payment: {                           // ← 서브머신 2 (동시에 살아있음)
      initial: 'PENDING',
      states: {
        PENDING: { on: { CONFIRM_PAYMENT: { target: 'PAID', actions: {type:'recordPayment'} } } },
        PAID:    { on: { REFUND_PAYMENT: { target: 'REFUNDED' } } },
        REFUNDED: { type: 'final' },
      },
    },
  },
});
```

### snapshot.value 의 shape 이 바뀐다

```ts
// 일반 머신:
snapshot.value = 'IN_TRANSIT'

// parallel 머신:
snapshot.value = { delivery: 'IN_TRANSIT', payment: 'PAID' }
```

DB 도 두 컬럼으로 분리 — `status` (delivery) + `paymentStatus`.
Prisma 마이그레이션: `prisma/migrations/20260728040210_add_payment_parallel_state/`

```sql
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'REFUNDED');
ALTER TABLE "shipments"
  ADD COLUMN "paidAmount" INTEGER,
  ADD COLUMN "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING';
```

### `stateIn` — 서브머신 사이 조율

```ts
guards: {
  isPaid: stateIn({ payment: 'PAID' }),   // ← payment 서브머신을 참조
}

// delivery 서브머신 안에서 사용:
OUT_FOR_DELIVERY: {
  on: {
    DELIVER: {
      guard: 'isPaid',                    // ← 결제 안 됐으면 배송완료 거부
      target: 'DELIVERED',
    },
  },
}
```

이렇게 하면 "결제 미완료인데 배송 완료 처리하려는 실수" 가 머신 레벨에서 차단된다. context 에 `paymentStatus` 를 복제해서 관리할 필요 없이 XState 가 알아서 다른 서브머신의 상태를 조회한다.

### Command handler 의 대응

`transition-shipment.command.ts:75~103`

```ts
const result = runTransition({
  currentDelivery: shipment.status,
  currentPayment: shipment.paymentStatus,
  context,
  event,
});

if (!result.changed) throw new AppException(SHIPMENT_ERRORS.INVALID_TRANSITION);

await tx.shipment.update({
  data: {
    status: result.nextDelivery,
    paymentStatus: result.nextPayment,
    paidAmount: result.context.paidAmount,
    ...patch,
  },
});
```

`changed = deliveryChanged || paymentChanged` — 둘 중 하나라도 바뀌면 성공. 이걸로 payment-only 이벤트 (`CONFIRM_PAYMENT`) 도 자연스럽게 처리됨.

### 언제 parallel 을 써야 하나

| 상황 | 판단 |
|---|---|
| 두 lifecycle 이 서로 독립적으로 진행됨 (배송 vs 결제) | ✅ parallel |
| 한쪽이 다른 쪽의 서브셋 (payment=결제완료면 delivery=배송가능) | 🤔 nested state 로 충분할 수도 |
| 상태 조합이 폭발한다 (N × M) | ✅ parallel 로 N + M 으로 압축 |
| 하나의 lifecycle 이 여러 단계로 세분화 | ❌ nested/hierarchical state |

---

## 9. 고급 패턴 B — invoke + fromPromise (외부 API 를 머신 안에서)

### 문제 상황

라우팅 API 호출 같은 **비동기 부수효과** 를 어디서 처리할까?
- ✗ Action 안에서 fetch: action 은 pure 여야 함
- ✗ Command handler 에서 fetch 후 machine 에 결과 전달: state machine 밖에 로직이 새어나감

### 해법: `invoke` + `fromPromise`

`route-planning.machine.ts:32~91`

```ts
export const createRoutePlanningMachine = (routingService: RoutingService) =>
  setup({
    types: { context: {} as RoutePlanningContext, /* ... */ },
    actors: {
      // ← promise 를 XState actor 로 감싼다
      callRoutingApi: fromPromise<IRoutingResponse, RoutePlanningInput>(async ({ input }) =>
        routingService.suggestRoute(input),
      ),
    },
    // ...
  }).createMachine({
    id: 'routePlanning',
    initial: 'idle',
    states: {
      idle: {
        on: { PLAN: { target: 'planning' } },
      },
      planning: {
        invoke: {
          src: 'callRoutingApi',
          input: ({ context }) => ({ originCode: context.originCode, destinationCode: context.destinationCode }),
          onDone:  { target: 'planned', actions: { type: 'applyPlan' } },   // ← promise resolve
          onError: { target: 'failed',  actions: { type: 'applyError' } }, // ← promise reject
        },
      },
      planned: { type: 'final' },
      failed:  { on: { RETRY: { target: 'planning' } } },   // ← 실패해도 RETRY 로 재도전
    },
  });
```

### 왜 factory 함수로 감쌌나

`RoutingService` 는 런타임에 DI 로 주입받는 인스턴스인데, 머신 정의 자체는 **정적으로 로딩된다**. 그래서:
- ✅ `createRoutePlanningMachine(service)` 팩토리로 만들고 closure 로 서비스 캡처
- ✗ context 에 서비스 함수를 밀어넣는 트릭 (타입 안전성 깨짐)
- ✗ 글로벌 싱글턴 등록 (테스트 어려움)

### Promise-friendly 어댑터

`route-planning.util.ts:22~48`

```ts
export const runRoutePlanning = async (
  routingService: RoutingService,
  req: IRoutingRequest,
): Promise<IRoutePlanningResult> => {
  const machine = createRoutePlanningMachine(routingService);
  const actor = createActor(machine, { input: req, inspect: getShipmentInspector() });

  actor.start();
  actor.send({ type: 'PLAN' });

  // waitFor 로 최종 상태까지 대기 (final = planned, 또는 failed)
  const finalSnapshot = await waitFor(
    actor,
    (snap) => snap.status === 'done' || snap.value === 'failed',
    { timeout: 5_000 },
  );
  actor.stop();

  return {
    status: finalSnapshot.value as 'planned' | 'failed',
    hops: finalSnapshot.context.hops,
    etaMinutes: finalSnapshot.context.etaMinutes,
    error: finalSnapshot.context.error,
  };
};
```

### 사용처

`plan-route.command.ts:34~68`

```ts
if (command.props.hops && command.props.hops.length >= 2) {
  hops = command.props.hops;           // manual: 프론트가 hop 목록 지정
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
```

### invoke 를 언제 쓰나

- **외부 API 호출** (라우팅, 결제 승인, 지도 조회)
- **긴 트랜잭션의 각 단계** (일련의 async step 을 상태로 표현)
- **에러/재시도 로직** 을 상태로 표현하고 싶을 때 (`failed → RETRY → planning`)
- 그냥 promise 를 훅으로 부르는 것보다 `이 promise 는 이 상태의 부수효과다` 라고 선언적으로 표현할 수 있어서, 흐름 파악과 실패 처리가 훨씬 명확해진다.

---

## 10. 고급 패턴 C — Outbox 패턴 (상태 전이 → Kafka)

### 문제 상황: 이중 쓰기 (dual write)

```ts
// ❌ 안티패턴
await prisma.shipment.update({ ... });      // 1. DB 커밋
await kafka.send({ ... });                   // 2. Kafka 발행
// 만약 이 사이에 서버가 죽으면? DB 는 바뀌었는데 Kafka 이벤트는 안 나감 → 컨슈머가 놓침
```

### 해법: Outbox 테이블 + 백그라운드 publisher

**같은 트랜잭션 안에서 DB 와 outbox row 를 함께 커밋**하고, 별도 프로세스가 outbox 를 폴링해서 Kafka 로 발행. 이렇게 하면:
- DB 커밋 성공 = 이벤트 발행 예약 완료
- 서버가 죽어도 outbox row 가 남아 있어서 재기동 후 재발행
- at-least-once 배송 보장

### 스키마

`prisma/schema.prisma` — `OutboxEvent` 모델

```prisma
model OutboxEvent {
  id          Int       @id @default(autoincrement())
  aggregateId String    // shipmentId 같은 것
  eventType   String    // 'shipment.transitioned'
  payload     Json
  publishedAt DateTime? // null = 아직 발행 안 됨
  createdAt   DateTime  @default(now())

  @@index([publishedAt])
}
```

### 1단계 — 상태 전이 시 outbox 에 append

`transition-shipment.command.ts:115~128` (같은 `$transaction` 안!)

```ts
await tx.shipment.update({ data: { status: nextDelivery, paymentStatus: nextPayment, ... } });
await tx.shipmentEvent.create({ ... });

await tx.outboxEvent.create({
  data: {
    aggregateId: String(shipmentId),
    eventType: OUTBOX_EVENT_TYPES.SHIPMENT_TRANSITIONED,   // 'shipment.transitioned'
    payload: {
      shipmentId,
      fromStatus: shipment.status,       toStatus: nextDelivery,
      fromPaymentStatus: shipment.paymentStatus, toPaymentStatus: nextPayment,
      eventType: event.type,
      occurredAt: new Date().toISOString(),
    },
  },
});
```

### 2단계 — 백그라운드 publisher 가 폴링해서 발행

`outbox-publisher.service.ts:32~74`

```ts
@Cron(CronExpression.EVERY_5_SECONDS)
async publishPending(): Promise<void> {
  if (this.running) return;      // 중복 실행 방지 (기본 락)
  this.running = true;

  try {
    const pending = await this.prisma.outboxEvent.findMany({
      where: { publishedAt: null },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,          // 50
    });

    const publishedIds: number[] = [];
    for (const event of pending) {
      const topic = OUTBOX_TOPIC_MAPPING[event.eventType];   // 'shipment.events'
      try {
        await this.kafka.sendMessage(topic, event.payload, event.aggregateId);
        publishedIds.push(event.id);
      } catch (err) {
        this.logger.error(`Failed to publish outbox event id=${event.id}: ${err.message}`);
        // publishedAt 은 null 로 남음 → 다음 tick 에서 재시도
      }
    }

    if (publishedIds.length > 0) {
      await this.prisma.outboxEvent.updateMany({
        where: { id: { in: publishedIds } },
        data: { publishedAt: new Date() },
      });
    }
  } finally {
    this.running = false;
  }
}
```

### 보장하는 것 / 안 하는 것

| 속성 | 보장? | 설명 |
|---|---|---|
| **at-least-once** delivery | ✅ | 실패한 row 는 `publishedAt=null` 로 남아 다음 tick 에 재시도 |
| **순서** (aggregate 내부) | ✅* | `id` 오름차순으로 발행. Kafka partition key = aggregateId 로 같은 shipmentId 는 같은 파티션 |
| **exactly-once** | ❌ | Kafka 에 발행 후 `publishedAt` 업데이트 실패 시 재발행됨 → 컨슈머가 idempotent 해야 함 |
| **트랜잭션 원자성** | ✅ | DB 트랜잭션 롤백되면 outbox row 도 롤백 → "이벤트만 발행되고 상태는 안 바뀜" 상황 없음 |

### 왜 이 패턴이 State Machine 과 궁합이 좋은가

- 상태 전이 = 도메인에서 관측 가능한 discrete event → 그대로 outbox 이벤트로 변환하기 자연스러움
- Command handler 가 이미 트랜잭션 안에서 `ShipmentEvent` 이력을 남기고 있음 → outbox 도 같은 자리에 붙이기만 하면 됨
- 컨슈머 (email, push, analytics) 는 machine 을 몰라도 됨 — outbox 이벤트 payload 만 읽음

---

## 11. 고급 패턴 D — Stately Inspect (dev 시각화)

### 문제 상황

머신이 커지면 "이 이벤트가 왜 거절됐지?", "context 값이 지금 뭐지?" 를 로그로만 파악하기 힘들다.

### 해법: `@statelyai/inspect`

XState 팀이 만든 공식 inspector. Sky inspector (Node 용) 는 stately.ai 클라우드로 스냅샷을 스트리밍해서 브라우저에서 머신 그래프를 시각적으로 볼 수 있다.

`src/common/state-machines/inspector.ts`

```ts
export const getShipmentInspector = () => {
  if (initialized) return cachedInspect;
  initialized = true;

  if (process.env.NODE_ENV === 'production') return undefined;      // ← prod 금지
  if (process.env.XSTATE_INSPECT !== 'true') return undefined;      // ← opt-in

  const { inspect } = createSkyInspector({
    autoStart: true,
    onerror: (err) => logger.warn(`Sky inspector error: ${err.message}`),
  });
  cachedInspect = inspect;
  logger.log('Stately Sky inspector attached — check stdout for inspection URL');
  return cachedInspect;
};
```

`shipment-machine.util.ts` 에서 `createActor` 호출 시 inspect 옵션으로 넘김.

```ts
const inspect = getShipmentInspector();
const actor = createActor(shipmentMachine, { snapshot, input: context, inspect });
```

### 켜는 방법

```bash
# .env
XSTATE_INSPECT=true

pnpm dev
# → 로그에 https://stately.ai/inspect/... URL 이 출력됨
# → 브라우저에서 열면 실시간으로 상태 전이 / context 변화를 관찰 가능
```

### 왜 좋은가

- **파일을 열지 않고도** 머신 구조와 현재 상태를 시각적으로 파악
- 이벤트를 발행하면 다이어그램 위에서 노드가 하이라이팅됨
- Guard 실패로 인한 same-state 상황도 화면에서 명시적으로 표시
- Prod 에서는 자동으로 꺼짐 (`NODE_ENV === 'production'` 체크) — 실수로 켜질 걱정 없음

### 언제 켜야 하나

- 새 상태/이벤트 추가 후 흐름 검증
- "왜 이 전이가 안 되지?" 디버깅
- 팀원에게 도메인 lifecycle 을 설명할 때 화면 공유

---

## 12. 고급 패턴 E — Nested (Compound) States

### 문제 상황

`OUT_FOR_DELIVERY` 하나로 뭉뚱그리기엔 실제로 여러 하위 단계가 있다:
- 기사가 이동 중 (`EN_ROUTE`)
- 문 앞 도착, 초인종 눌렀는데 응답 대기 (`AT_DOOR`)

이걸 flat 하게 풀면 `OUT_FOR_DELIVERY_EN_ROUTE`, `OUT_FOR_DELIVERY_AT_DOOR` 상태가 늘어난다. 그럼 부모 레벨 이벤트 (`DELIVER`, `FAIL_DELIVERY`, `CANCEL`) 를 두 상태 모두에 복붙해야 함.

### 해법: Compound state — 상태 안에 상태

`shipment.machine.ts:168~212`

```ts
OUT_FOR_DELIVERY: {
  entry: { type: 'markDeliveryStart' },
  exit:  { type: 'clearDeliveryTimers' },
  initial: 'EN_ROUTE',                    // ← 진입 시 초기 sub-state
  on: {
    // 부모 레벨 이벤트 — 모든 sub-state 에서 유효 (한 번만 선언)
    DELIVER:          { guard: 'isPaid', target: 'DELIVERED' },
    FAIL_DELIVERY:    { target: 'DELIVERY_FAILED', actions: { type: 'incrementFailure' } },
    TIMEOUT_DELIVERY: { target: 'DELIVERY_FAILED', actions: { type: 'incrementFailure' } },
  },
  states: {
    EN_ROUTE: {
      on: { ARRIVE_AT_DOOR: { target: 'AT_DOOR' } },   // ← sub-state 사이 이동
    },
    AT_DOOR: {
      entry: { type: 'markArrivedAtDoor' },            // ← sub-state entry action
      after: { 900000: { target: '#deliveryFailed', ... } },  // 14장 참고
    },
  },
},
```

### snapshot.value 의 shape

Flat 이면 string, compound 면 object:

```ts
// EN_ROUTE 일 때:
snapshot.value = { delivery: { OUT_FOR_DELIVERY: 'EN_ROUTE' }, payment: 'PAID' }

// AT_DOOR 일 때:
snapshot.value = { delivery: { OUT_FOR_DELIVERY: 'AT_DOOR' }, payment: 'PAID' }

// 그 외 flat 상태 (IN_TRANSIT 등):
snapshot.value = { delivery: 'IN_TRANSIT', payment: 'PAID' }
```

DB 는 flat enum 컬럼 (`status` + `deliveryPhase`) 두 개로 나눠 저장. Util 이 두 shape 사이 변환.

`shipment-machine.util.ts:41~59`

```ts
const buildDeliveryValue = (delivery, phase) => {
  if (delivery === 'OUT_FOR_DELIVERY') {
    return { OUT_FOR_DELIVERY: phase ?? 'EN_ROUTE' };
  }
  return delivery;
};

const parseDeliveryValue = (value) => {
  if (typeof value === 'string') return { delivery: value, phase: null };
  return { delivery: 'OUT_FOR_DELIVERY', phase: value.OUT_FOR_DELIVERY };
};
```

### 이벤트 처리 규칙

부모/자식이 같은 이벤트 이름을 다루면 **가장 안쪽 (deepest) 상태의 핸들러가 우선**. 예: `AT_DOOR` 에서 `CANCEL` 을 정의하고 `OUT_FOR_DELIVERY` 에서도 `CANCEL` 을 정의하면 `AT_DOOR` 것이 이긴다. 자식에 없으면 부모로 위임됨.

이 프로젝트는 자식 상태 (`EN_ROUTE`, `AT_DOOR`) 가 각자 자기만의 이벤트 (`ARRIVE_AT_DOOR`) 만 다루고, 종료 이벤트 (`DELIVER`, `FAIL_DELIVERY`) 는 부모가 처리 → 중복 없음.

### Parallel vs Nested — 언제 뭘 쓰나

| 상황 | 선택 |
|---|---|
| 독립적으로 흐르는 여러 lifecycle | **parallel** (`delivery + payment`) |
| 한 lifecycle 안의 단계적 세분화 | **nested** (`OUT_FOR_DELIVERY.EN_ROUTE / AT_DOOR`) |
| 둘 다 필요 | 함께 사용 — 이 프로젝트가 그 예시 |

---

## 13. 고급 패턴 F — Entry / Exit Actions

### 개념 차이

지금까지 본 action 은 **transition 에 붙어있음**: 특정 이벤트로 특정 target 으로 갈 때만 실행.
Entry / Exit action 은 **state 에 붙어있음**: 어떤 경로로 진입/이탈하든 무조건 실행.

```ts
transitions: {
  DELIVER: { target: 'DELIVERED', actions: [{ type: 'foo' }] }  // DELIVER 시에만
  FAIL_DELIVERY: { target: 'DELIVERY_FAILED', actions: [{ type: 'foo' }] }  // FAIL 시에만
}
// vs
DELIVERY_FAILED: {
  entry: { type: 'foo' }  // 어떤 이벤트로 DELIVERY_FAILED 에 들어와도 실행
}
```

### 실전 예시 — SLA 타임스탬프 자동 관리

`shipment.machine.ts:169~212`

```ts
OUT_FOR_DELIVERY: {
  entry: { type: 'markDeliveryStart' },   // ← 이 상태로 들어오면 시작 시각 기록
  exit:  { type: 'clearDeliveryTimers' }, // ← 이 상태에서 나가면 (성공/실패 무관) 타이머 정리
  // ...
  states: {
    AT_DOOR: {
      entry: { type: 'markArrivedAtDoor' },  // ← 문 앞 도착 시각 기록 (after timeout 기준점)
    },
  },
},

// actions:
markDeliveryStart:  assign({ deliveryStartedAt: () => new Date() }),
clearDeliveryTimers: assign({ deliveryStartedAt: () => null, arrivedAtDoorAt: () => null }),
markArrivedAtDoor:  assign({ arrivedAtDoorAt: () => new Date() }),
```

**얻는 것**:
- `DISPATCH_LAST_MILE` 로 `OUT_FOR_DELIVERY` 진입해도, 나중에 재시도로 (`RETRY_DELIVERY`) 진입해도 → 두 경우 모두 `deliveryStartedAt` 자동 갱신
- 모든 종료 경로 (`DELIVER`, `FAIL_DELIVERY`, `TIMEOUT_DELIVERY`, `CANCEL`) 에서 자동 cleanup — 개별 transition 에 넣을 필요 없음

### 발화 순서 (중요)

**진입 시**: `parent.entry → child.entry` 순 (겉에서 안으로)
**이탈 시**: `child.exit → parent.exit` 순 (안에서 밖으로)
**전이 순서**: `source.exit → transition.actions → target.entry`

예: `EN_ROUTE → AT_DOOR` 전이 시
1. `EN_ROUTE` 는 exit action 없음 → skip
2. transition 자체의 action 없음 → skip
3. `AT_DOOR.entry: markArrivedAtDoor` 실행

예: `AT_DOOR → DELIVERY_FAILED` (TIMEOUT_DELIVERY) 전이 시
1. `AT_DOOR.exit` 없음 → skip
2. `OUT_FOR_DELIVERY.exit: clearDeliveryTimers` 실행 (부모 이탈)
3. transition action `incrementFailure` 실행
4. `DELIVERY_FAILED.entry` 없음 → skip

### Entry/Exit vs Transition action — 언제 뭘 쓰나

| 케이스 | 선택 |
|---|---|
| 특정 이벤트에만 반응 | **transition action** (예: `CONFIRM_PAYMENT → recordPayment`) |
| 진입 경로 여러 개, 모두 동일 동작 | **entry** (예: `markDeliveryStart`) |
| 이탈 시 항상 cleanup 필요 | **exit** (예: `clearDeliveryTimers`) |
| context 초기화 / 리셋 | 대개 **entry** |

### ⚠️ Snapshot 복원 시 entry 재실행되지 않음

`resolveShipmentSnapshot` 으로 저장된 상태 복원 시, entry action 은 **재실행되지 않는다**. Entry 는 "transition 을 통해 상태로 들어올 때" 만 fire. 복원은 "이미 그 상태에 있는 것으로 세팅" 이라 fire 안 함.

→ Entry action 결과는 반드시 context 나 DB 에 persist 해야 함 (transient 하면 안 됨).

---

## 14. 고급 패턴 G — `after` (Delayed Transitions) + Cron 스캐너 패턴

### XState `after` 문법

특정 상태에 진입한 뒤 N ms 가 지나면 자동으로 target 으로 전이.

`shipment.machine.ts:199~206`

```ts
AT_DOOR: {
  entry: { type: 'markArrivedAtDoor' },
  after: {
    900000: {                             // ← 15분 (ms)
      target: '#deliveryFailed',          // ← ID 기반 참조 (parallel + nested 라 절대경로 안전)
      actions: { type: 'incrementFailure' },
    },
  },
},
```

여기서 `#deliveryFailed` 는 `DELIVERY_FAILED: { id: 'deliveryFailed', ... }` 에 부여한 ID. Parallel 리전 (`delivery`) 안, compound (`OUT_FOR_DELIVERY.AT_DOOR`) 안에서 sibling 상태를 참조하려면 ID 방식이 제일 확실함.

### ⚠️ 문제 — 이 프로젝트에선 `after` 가 실제로 fire 되지 않는다

XState 의 `after` timer 는 **actor 가 살아있는 동안에만** 돈다. 우리 `runTransition` 은 매 요청마다:

```ts
const actor = createActor(shipmentMachine, ...);
actor.start();
actor.send(event);
const next = actor.getSnapshot();
actor.stop();          // ← 스냅샷만 뽑고 즉시 stop
```

Timer 는 세팅되자마자 actor 가 stop 되면서 사라진다. Actor lifetime 이 request-scoped 이면 `after` 는 essentially 데코레이션.

### 해법: Cron 스캐너로 `after` 의미를 재현

**Machine 은 `after` 를 선언 (도메인 의도 문서화 + Inspector 시각화용)**,
**실제 timer 는 별도 Cron 이 DB 를 scan 해서 이벤트 dispatch 로 구현.**

`src/shipment/application/schedulers/delivery-timeout.service.ts:37~74`

```ts
@Injectable()
export class DeliveryTimeoutService {
  @Cron(CronExpression.EVERY_MINUTE)
  async scanExpiredAtDoor(): Promise<void> {
    const threshold = new Date(Date.now() - AT_DOOR_TIMEOUT_MS);   // 15min
    const expired = await this.prisma.shipment.findMany({
      where: {
        status: 'OUT_FOR_DELIVERY',
        deliveryPhase: 'AT_DOOR',
        arrivedAtDoorAt: { lt: threshold },
      },
    });

    for (const s of expired) {
      await this.commandBus.execute(
        new TransitionShipmentCommand({
          shipmentId: s.id,
          event: { type: 'TIMEOUT_DELIVERY' },       // ← 머신에 이벤트 dispatch
          actorType: ActorType.SYSTEM,
          actorId: 'delivery-timeout-scheduler',
        }),
      );
    }
  }
}
```

Machine 은 별도 `TIMEOUT_DELIVERY` 이벤트로 같은 target 을 가진다:

```ts
OUT_FOR_DELIVERY: {
  on: {
    TIMEOUT_DELIVERY: { target: 'DELIVERY_FAILED', actions: {type:'incrementFailure'} },
    FAIL_DELIVERY:    { target: 'DELIVERY_FAILED', actions: {type:'incrementFailure'} },
  },
}
```

`buildSideEffects` 에서 timeout 인 경우 `failureReason = 'NO_RESPONSE_TIMEOUT'` 도 자동 세팅.

### 원자성 / idempotency

- Transition 은 트랜잭션 안에서 `deliveryPhase` 를 다른 값으로 옮기므로 다음 tick 에서 다시 잡히지 않음
- 만에 하나 concurrent tick 이 같은 shipment 를 두 번 dispatch → 두 번째는 `INVALID_TRANSITION` 예외로 안전하게 실패
- 즉 스캐너는 idempotent 하게 동작

### 이 패턴을 다른 케이스에 적용

- "결제 pending 이 24h 지나면 자동 만료" → payment 서브머신에 `after: { 86400000: 'FAILED' }` + Cron
- "READY_FOR_PICKUP 이 48h 지나면 자동 CANCEL" → 같은 패턴
- 공통 규칙: **선언은 machine 에, 실제 dispatch 는 Cron 에**. 두 곳이 나뉜 것 같아도 (a) machine 이 canonical source of truth 유지, (b) 프로덕션 timer 는 DB 기반이라 재기동에 강함

### 순수 XState `after` 가 fire 되게 하려면

Actor 를 오래 살려야 함:

```ts
// 이런 구조에서는 실제로 fire 됨:
const actor = createActor(shipmentMachine);
actor.start();
setInterval(() => saveSnapshotToDb(actor.getSnapshot()), 1000);
// actor.stop() 을 안 함 (프로세스 lifetime 동안 살아있음)
```

인메모리 orchestrator, WebSocket 서버, 게임 세션 등에서는 이렇게 씀. 배송 도메인처럼 request-scoped 서비스는 Cron 방식이 정답.

---

## 15. 한눈 정리

### 기초 개념

| 개념 | 역할 | 이 프로젝트에서의 예 |
|---|---|---|
| **State** | 지금 어디 있는가 | `CREATED`, `IN_TRANSIT`, `DELIVERED` |
| **Event** | 무슨 일이 벌어졌나 | `MARK_PICKED_UP`, `DELIVER { proofUrl }` |
| **Context** | status 로 표현 안 되는 데이터 | `driverId`, `currentHopIndex`, `paidAmount` |
| **Guard** | 이 전이가 유효한가? | `hasPickupDriver`, `canRetryDelivery`, `isPaid` |
| **Action** | 전이 순간 context 를 어떻게 바꾸나 | `incrementHop`, `assignDriver`, `recordPayment` |
| **always** | 조건 만족 시 자동 전이 | `AT_HUB` → `OUT_FOR_DELIVERY` (최종 hub) |
| **Self-transition** | 상태 유지, context 만 갱신 | `ASSIGN_PICKUP_DRIVER` |
| **final** | 더 이상 이벤트 안 받음 | `DELIVERED`, `RETURNED`, `CANCELLED` |

### 심화 패턴

| 패턴 | 언제 | 이 프로젝트에서 |
|---|---|---|
| **parallel state** | 독립적으로 진행되는 lifecycle 이 여러 개 | delivery + payment 두 서브머신 동시 실행 |
| **stateIn (cross-substate guard)** | 서브머신 간 조율 | `DELIVER` 은 `payment=PAID` 일 때만 |
| **nested (compound)** | 한 상태 안의 여러 단계 | `OUT_FOR_DELIVERY.EN_ROUTE / AT_DOOR` |
| **entry / exit actions** | 진입/이탈 경로 여러 개, 공통 처리 필요 | `markDeliveryStart` / `clearDeliveryTimers` |
| **after (declarative timer)** | "N ms 후 자동 전이" 를 문서화 | `AT_DOOR` 15분 후 `#deliveryFailed` |
| **Cron 스캐너 패턴** | Request-scoped actor 에서 `after` 대체 | `DeliveryTimeoutService` @ EVERY_MINUTE |
| **invoke + fromPromise** | 비동기 부수효과를 머신 안에서 | routing API 호출을 `planning → planned/failed` 상태로 |
| **Outbox 패턴** | 상태 전이를 안전하게 외부 발행 | DB 트랜잭션 + outbox row → Cron publisher → Kafka |
| **Stately Inspect** | dev 환경 시각화 | `XSTATE_INSPECT=true` 로 실시간 스냅샷 스트리밍 |

### 지켜야 할 5가지 원칙

1. **머신은 pure** — DB, Kafka, HTTP 모른다. context/guard/action 만.
2. **부수효과는 command 트랜잭션 안에서** — status 업데이트 + 이력 append + outbox 를 한 커밋에.
3. **`shipment.status` / `paymentStatus` / `deliveryPhase` 는 오직 `TransitionShipmentCommand` 를 통해서만 바꾼다** — 다른 경로 금지.
4. **외부 발행은 outbox 를 통해서만** — DB 커밋 후 Kafka 직접 발행 금지 (이중 쓰기 위험).
5. **`after` 는 machine 에 선언 + Cron 이 실제 dispatch** — request-scoped actor 에서는 timer 가 안 fire 됨을 잊지 말 것.
