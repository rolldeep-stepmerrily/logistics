# Logistics

XState v5 기반 상태 머신 학습용 배송 도메인 프로젝트. NestJS + Prisma + PostgreSQL + Redis + Kafka.

## Quick Start

```bash
pnpm install
cp .env.example .env
docker-compose up -d
pnpm db:migrate
pnpm dev
```

- API: http://localhost:3001
- Swagger/Scalar: http://localhost:3001/docs
- Kafka UI: http://localhost:8081

## 학습 포인트

**1. 상태 머신 정의**
`src/common/state-machines/shipment/shipment.machine.ts` — XState v5 `setup().createMachine()` 패턴, guard/action/context.

**2. 순수 전이 실행**
`src/common/state-machines/shipment/shipment-machine.util.ts` — `runTransition({ currentStatus, context, event })` 로 다음 상태 계산.

**3. 트랜잭션 통합**
`src/shipment/application/commands/transition-shipment.command.ts` — machine 결과에 맞춰 shipment/driver/routePlan 을 한 트랜잭션에 갱신하는 방법.

**4. 학습 시나리오 실행**
```
POST /shipments                        # CREATED
POST /shipments/:id/transitions        # { event: 'REQUEST_PICKUP' }
POST /shipments/:id/transitions        # { event: 'ASSIGN_PICKUP_DRIVER', payload: { driverId } }
POST /shipments/:id/transitions        # { event: 'MARK_PICKED_UP' }
POST /shipments/:id/transitions        # { event: 'ARRIVE_AT_ORIGIN_HUB' }
POST /shipments/:id/route-plan         # { hops: ['SEO01', 'DAJ01', 'BSN01'] }
POST /shipments/:id/transitions        # { event: 'DISPATCH_LINE_HAUL' }
POST /shipments/:id/transitions        # { event: 'ARRIVE_AT_HUB' } × N
POST /shipments/:id/transitions        # { event: 'DISPATCH_LAST_MILE', payload: { driverId } }
POST /shipments/:id/transitions        # { event: 'DELIVER', payload: { proofUrl } }

GET /shipments/:id/events              # 상태 전이 이력 전체
```

자세한 도메인 규칙과 상태 머신 다이어그램은 [CLAUDE.md](./CLAUDE.md) 참고.

## Scripts

```bash
pnpm dev            # 개발 서버 (watch)
pnpm build          # 프로덕션 빌드
pnpm start          # 빌드된 서버 실행
pnpm lint           # Biome lint
pnpm check          # Biome check + auto-fix
pnpm db:migrate     # Prisma migrate dev
pnpm db:generate    # Prisma client 생성
pnpm test           # Jest
```
