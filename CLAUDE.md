# Logistics

XState v5 기반 상태 머신 학습 프로젝트. 배송 도메인 — Shipment 한 건의 lifecycle을 여러 hub를 거쳐 배송/실패/반품/취소로 이어지도록 모델링한다.

## 학습 목표

- **State machine을 도메인 표현 도구로**: enum + if 로 흩어진 상태 전이를 XState machine 하나에 몰아넣기
- **Guard / Action / Context** 를 실전 도메인 규칙에 매핑 (driver 배정 필수, hop index 관리, 재시도 횟수 제한)
- **Pure transition vs Side effects 분리**: machine 은 다음 상태만 계산, DB / driver 상태 / route hop 이동은 command handler 트랜잭션에서 수행
- **Event sourcing 스타일 이력**: 모든 전이가 `ShipmentEvent` 테이블에 append-only 로 기록됨

## 프로젝트 구조

```
logistics/
├── src/
│   ├── app.module.ts
│   ├── main.ts
│   ├── common/
│   │   ├── cqrs/           # TypedCommandBus, TypedQueryBus, GlobalCqrsModule
│   │   ├── decorators/
│   │   ├── entities/
│   │   ├── exceptions/     # AppException, GLOBAL_ERRORS
│   │   ├── filters/
│   │   ├── guards/         # JwtGuard
│   │   ├── interceptors/
│   │   ├── kafka/          # KafkaProducerService
│   │   ├── middlewares/
│   │   ├── prisma/
│   │   ├── redis/          # RedisService, RedisThrottlerStorage
│   │   └── state-machines/ # ★ XState 머신 정의 위치
│   │       └── shipment/
│   │           ├── shipment.machine.ts
│   │           └── shipment-machine.util.ts
│   ├── shipment/           # 핵심 도메인 — 상태 전이 트랜잭션 로직
│   ├── driver/             # 기사 등록/상태 (BUSY 는 배차 시스템만 부여)
│   └── warehouse/          # 창고/허브 CRUD
├── prisma/
│   └── schema.prisma
├── docker-compose.yml      # Postgres(5433) + Redis(6380) + Kafka(9093) + Kafka UI(8081)
└── .env.example
```

**포트는 ticketing 과 겹치지 않도록 +1 씩 이동.**

## 에이전트 & 스킬 (ticketing 과 동일)

| 이름 | 경로 | 용도 |
|------|------|------|
| `code-reviewer` | `.claude/agents/code-reviewer.md` | 코드 리뷰 |
| `general-convention` | `.claude/skills/code-convention/general-convention/SKILL.md` | TS 코딩 컨벤션 |
| `jsdoc-convention` | `.claude/skills/code-convention/jsdoc-convention/SKILL.md` | JSDoc 작성 규칙 |
| `commit-convention` | `.claude/skills/git-convention/commit-convention/SKILL.md` | 커밋/브랜치 컨벤션 |
| `pull-request-convention` | `.claude/skills/git-convention/pull-request-convention/SKILL.md` | PR 생성 워크플로우 |
| `nestjs-cqrs` | `.claude/skills/be-convention/nestjs-cqrs/SKILL.md` | NestJS CQRS + UseCase 아키텍처 패턴 |

## Git 브랜치 전략

- PR base 브랜치: 항상 `develop` (핫픽스/릴리스만 `main`)
- feat-*/chore-* 브랜치 분기, 의미 단위로 자주 commit

## 패키지 매니저

**pnpm** 사용. npm/yarn 금지.

```bash
pnpm install
pnpm dev
pnpm build
pnpm lint
pnpm check
pnpm db:migrate
pnpm db:generate
```

## 기술 스택

| 영역 | 기술 |
|---|---|
| Backend | NestJS 11, Prisma 7, PostgreSQL, Redis, Kafka |
| CQRS | @nestjs/cqrs |
| **State Machine** | **XState v5** |
| Message Queue | KafkaJS |
| Cache / Lock | ioredis |
| DB | PostgreSQL (Prisma) |
| API Docs | Scalar (`/docs`, dev 환경만) |

## Path Aliases

```typescript
import { AppException } from '@@exceptions';
import { TypedCommandBus, TypedQueryBus } from '@@cqrs';
import { PrismaService } from '@@db';
import { ShipmentStatus, DriverStatus } from '@@prisma';
import { RedisService } from '@@redis';
import { KafkaProducerService } from '@@kafka';
import { JwtGuard } from '@@guards';
import { runTransition, shipmentMachine } from '@@state-machines';
```

## Shipment 상태 머신

전체 흐름은 `src/common/state-machines/shipment/shipment.machine.ts` 를 참고.

```
CREATED
  ├─ REQUEST_PICKUP → READY_FOR_PICKUP
  └─ CANCEL         → CANCELLED

READY_FOR_PICKUP
  ├─ ASSIGN_PICKUP_DRIVER (self, actions: assignDriver)
  ├─ MARK_PICKED_UP [guard: hasPickupDriver] → PICKED_UP
  └─ CANCEL         → CANCELLED

PICKED_UP
  └─ ARRIVE_AT_ORIGIN_HUB → AT_ORIGIN_HUB

AT_ORIGIN_HUB
  └─ DISPATCH_LINE_HAUL → IN_TRANSIT

IN_TRANSIT
  └─ ARRIVE_AT_HUB (actions: incrementHop) → AT_HUB

AT_HUB
  ├─ always [guard: hasReachedFinalHub] → OUT_FOR_DELIVERY
  ├─ DISPATCH_LINE_HAUL [guard: hasMoreHops]    → IN_TRANSIT
  └─ DISPATCH_LAST_MILE [guard: hasReachedFinalHub, actions: assignDriver] → OUT_FOR_DELIVERY

OUT_FOR_DELIVERY
  ├─ DELIVER        → DELIVERED (final)
  └─ FAIL_DELIVERY (actions: incrementFailure) → DELIVERY_FAILED

DELIVERY_FAILED
  ├─ RETRY_DELIVERY [guard: canRetryDelivery] → OUT_FOR_DELIVERY
  └─ RETURN         → RETURNED (final)
```

### 상태 머신과 부수효과 경계

- `shipment.machine.ts` — **순수**. context / guard / action 만 있고 DB / Kafka 몰라도 됨.
- `shipment-machine.util.ts` — `runTransition()` 으로 pure한 다음 상태 계산.
- `transition-shipment.command.ts` — **트랜잭션 안**에서 machine 실행 결과에 따라:
  1. `shipment.status` 업데이트
  2. `ShipmentEvent` append (이력)
  3. `Driver` 상태 및 `DriverAssignment` 갱신
  4. `RoutePlan.currentHopIndex` 이동
  5. `shipment.currentHubId` 갱신

**규칙**: 상태 전이는 오직 `TransitionShipmentCommand` 를 통해서만. 다른 곳에서 `shipment.status` 를 직접 update 하지 말 것.

## 에러 처리

`AppException` 사용 통일. `new Error()` / `HttpException` 직접 금지.

```typescript
export const SHIPMENT_ERRORS = {
  INVALID_TRANSITION: {
    statusCode: HttpStatus.CONFLICT,
    errorCode: 'SHIPMENT_INVALID_TRANSITION',
    message: 'State transition is not allowed from the current status',
  },
};

throw new AppException(SHIPMENT_ERRORS.INVALID_TRANSITION);
```

## Biome 설정 (ticketing 과 동일)

- indent: 2 spaces, lineWidth: 120, quote: single, trailingCommas: all, semicolons: always

## Docker

```bash
docker-compose up -d
# Kafka UI: http://localhost:8081
```

## 환경 변수

- 신규 env 는 `app.module.ts` Joi 스키마에 반드시 추가.
- Railway Railpack 이슈 대응 위해 `NODE_ENV` 는 `.empty('').default('development')` 처리.

## 다음에 시도해볼 만한 실습

- `shipmentMachine` 을 `parallel` state 로 확장: `delivery` + `payment` 서브 상태 병렬 실행
- `invoke` 로 외부 라우팅 API 호출을 machine 안에 넣기
- XState `@statelyai/inspect` 로 dev 환경에서 상태 시각화
- Outbox 패턴 붙여서 상태 전이 → Kafka 이벤트 발행
