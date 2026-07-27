# Logistics — 기술 명세

## 개요

**학습 목적**: XState v5 상태 머신을 실제 도메인 로직 + DB 트랜잭션 + 부수효과 (driver 배정, hub 이동) 과 결합하는 패턴을 연습한다.

**도메인**: 택배(shipment) 한 건이 여러 창고(hub) 를 경유해 수취인에게 배송되기까지의 lifecycle. 픽업 기사 배정, 허브간 라인홀 이동, 라스트마일 배송, 배송 실패 & 재시도 & 반품.

---

## 도메인 모델

### User (송화주)
| 필드 | 타입 | 설명 |
|---|---|---|
| id | Int | PK |
| email | String | 고유 |
| name | String | |
| password | String | 해시 |

### Warehouse (창고/허브)
| 필드 | 타입 | 설명 |
|---|---|---|
| id | Int | PK |
| code | String | 창고 코드 (unique, 예: `SEO01`) |
| name | String | |
| type | WarehouseType | `ORIGIN` / `HUB` / `LOCAL` |
| address | String | |
| latitude / longitude | Decimal(9,6) | |
| capacity | Int | 수용 물동량 |

### Driver (기사)
| 필드 | 타입 | 설명 |
|---|---|---|
| id | Int | PK |
| name | String | |
| phone | String | unique |
| vehicleType | VehicleType | `BIKE` / `CAR` / `TRUCK` |
| status | DriverStatus | `OFFLINE` / `AVAILABLE` / `BUSY` |
| currentWarehouseId | Int? | 현재 소속 창고 |

**상태 규칙**:
- `OFFLINE ↔ AVAILABLE` 만 사용자가 수동으로 변경 가능
- `BUSY` 는 오직 배차 시스템(shipment transition) 이 부여
- 배차 종료 (`ARRIVE_AT_ORIGIN_HUB`, `DELIVER`, `CANCEL`) 시 자동으로 `AVAILABLE` 로 회수

### Shipment (핵심 aggregate)
| 필드 | 타입 | 설명 |
|---|---|---|
| id | Int | PK |
| trackingNumber | String | `WP-XXXXXXXX` unique |
| senderId | Int | User FK |
| status | ShipmentStatus | 상태 머신이 관리 |
| recipientName / Phone / Addr | String | 수취인 정보 |
| originHubId | Int | 출발 창고 |
| destinationHubId | Int | 도착 창고 |
| currentHubId | Int? | 현재 위치한 허브 (허브 사이 이동 중이면 null) |
| weightG | Int | |
| declaredValue | Int? | |
| failureReason | String? | 최근 배송 실패 사유 |
| deliveryProof | String? | 배송 완료 증빙 URL |

### ShipmentEvent (상태 전이 이력 = event log)
| 필드 | 타입 | 설명 |
|---|---|---|
| id | Int | PK |
| shipmentId | Int | |
| fromStatus | ShipmentStatus? | 이전 상태 (초기 CREATED 는 null) |
| toStatus | ShipmentStatus | 전이 후 상태 |
| eventType | String | 발행된 machine event type (예: `MARK_PICKED_UP`) |
| payload | Json? | event 원본 |
| actorType | ActorType | `SYSTEM` / `DRIVER` / `ADMIN` / `SENDER` |
| actorId | String? | |
| occurredAt | DateTime | |

**append-only.** 이 테이블은 조회 전용, update/delete 하지 않는다.

### RoutePlan (허브 라우팅)
| 필드 | 타입 | 설명 |
|---|---|---|
| id | Int | PK |
| shipmentId | Int | unique 1:1 |
| hops | Json | `string[]` — 경유할 창고 code 배열 |
| currentHopIndex | Int | 현재 몇 번째 hop 에 있는지 (0-based) |

### DriverAssignment (배차 이력)
| 필드 | 타입 | 설명 |
|---|---|---|
| id | Int | PK |
| shipmentId | Int | |
| driverId | Int | |
| purpose | AssignmentPurpose | `PICKUP` / `LINE_HAUL` / `LAST_MILE` |
| status | AssignmentStatus | `ACTIVE` / `COMPLETED` / `CANCELLED` |
| assignedAt / releasedAt | DateTime | |

---

## Shipment 상태 머신 (XState v5)

파일: `src/common/state-machines/shipment/shipment.machine.ts`

### States

| State | 의미 | Final? |
|---|---|---|
| `CREATED` | 송장 발급 완료, 픽업 요청 대기 | |
| `READY_FOR_PICKUP` | 픽업 요청됨, 기사 배정 대기 / 완료 | |
| `PICKED_UP` | 기사가 수거 완료, origin hub 로 이동 중 | |
| `AT_ORIGIN_HUB` | origin hub 도착, 라인홀 대기 | |
| `IN_TRANSIT` | 허브 사이 이동 중 | |
| `AT_HUB` | 중간 허브 도착 | |
| `OUT_FOR_DELIVERY` | 라스트마일 배송 시작 | |
| `DELIVERED` | 배송 완료 | ✔ |
| `DELIVERY_FAILED` | 배송 실패 (재시도 또는 반품 대기) | |
| `RETURNED` | 반품 완료 | ✔ |
| `CANCELLED` | 취소 (송화주/관리자) | ✔ |

### Context

```typescript
{
  driverId: number | null;      // 현재 배정된 기사
  currentHopIndex: number;      // route plan 상 현재 위치
  totalHops: number;            // route plan 전체 hop 수
  failureCount: number;         // 배송 실패 누적
  maxRetries: number;           // 재시도 상한 (기본 2)
}
```

### Guards

| Guard | 조건 |
|---|---|
| `hasPickupDriver` | `context.driverId !== null` |
| `hasReachedFinalHub` | `currentHopIndex >= totalHops - 1` |
| `hasMoreHops` | `currentHopIndex < totalHops - 1` |
| `canRetryDelivery` | `failureCount < maxRetries` |

### Events → Transitions

| Event | From | To | Guard | Action |
|---|---|---|---|---|
| `REQUEST_PICKUP` | CREATED | READY_FOR_PICKUP | — | — |
| `ASSIGN_PICKUP_DRIVER` | READY_FOR_PICKUP | (self) | — | `assignDriver` |
| `MARK_PICKED_UP` | READY_FOR_PICKUP | PICKED_UP | `hasPickupDriver` | — |
| `ARRIVE_AT_ORIGIN_HUB` | PICKED_UP | AT_ORIGIN_HUB | — | `clearDriver` |
| `DISPATCH_LINE_HAUL` | AT_ORIGIN_HUB / AT_HUB | IN_TRANSIT | AT_HUB → `hasMoreHops` | — |
| `ARRIVE_AT_HUB` | IN_TRANSIT | AT_HUB | — | `incrementHop` |
| (auto) | AT_HUB | OUT_FOR_DELIVERY | `hasReachedFinalHub` (always) | — |
| `DISPATCH_LAST_MILE` | AT_HUB | OUT_FOR_DELIVERY | `hasReachedFinalHub` | `assignDriver` |
| `DELIVER` | OUT_FOR_DELIVERY | DELIVERED | — | — |
| `FAIL_DELIVERY` | OUT_FOR_DELIVERY | DELIVERY_FAILED | — | `incrementFailure` |
| `RETRY_DELIVERY` | DELIVERY_FAILED | OUT_FOR_DELIVERY | `canRetryDelivery` | — |
| `RETURN` | DELIVERY_FAILED | RETURNED | — | — |
| `CANCEL` | CREATED / READY_FOR_PICKUP | CANCELLED | — | `clearDriver` |

### 상태 머신 vs 부수효과 경계

**Machine 안**: 다음 상태 계산, guard 검증, context 조작만.

**Command handler (`TransitionShipmentCommand`) 트랜잭션 안**:
1. `shipment.status` 업데이트
2. `ShipmentEvent` append (이력)
3. `Driver` 상태 (`AVAILABLE ↔ BUSY`) + `DriverAssignment` 생성/종료
4. `RoutePlan.currentHopIndex` 이동
5. `shipment.currentHubId` 갱신
6. `deliveryProof`, `failureReason` 저장

---

## HTTP API

### Auth (미구현, ticketing 참조하여 추가 가능)

### Shipments (`/shipments`)

| Method | Path | 설명 |
|---|---|---|
| POST | `/shipments` | 송장 생성 (초기 `CREATED`) |
| GET | `/shipments/:id` | 단건 조회 |
| GET | `/shipments/:id/events` | 상태 전이 이력 |
| POST | `/shipments/:id/transitions` | **상태 전이 (state machine event)** |
| POST | `/shipments/:id/route-plan` | 허브 라우팅 계획 등록 |

### Drivers (`/drivers`)

| Method | Path | 설명 |
|---|---|---|
| POST | `/drivers` | 기사 등록 |
| GET | `/drivers?status=&currentWarehouseId=` | 목록 |
| PATCH | `/drivers/:id/status` | 상태 변경 (OFFLINE ↔ AVAILABLE) |

### Warehouses (`/warehouses`)

| Method | Path | 설명 |
|---|---|---|
| POST | `/warehouses` | 창고 생성 |
| GET | `/warehouses` | 목록 |

---

## 에러 응답 형식

```json
{ "statusCode": 409, "errorCode": "SHIPMENT_INVALID_TRANSITION", "message": "..." }
```

주요 에러:
- `SHIPMENT_NOT_FOUND` 404
- `SHIPMENT_INVALID_TRANSITION` 409 — machine 이 event 를 거절 (또는 guard 실패)
- `SHIPMENT_ROUTE_NOT_PLANNED` 409 — `ARRIVE_AT_HUB` 전에 route plan 없음
- `SHIPMENT_DRIVER_NOT_AVAILABLE` 409 — 배차하려는 기사가 AVAILABLE 아님
- `SHIPMENT_DELIVERY_PROOF_REQUIRED` 400 — DELIVER 이벤트에 proofUrl 누락
- `DRIVER_INVALID_STATUS_CHANGE` 409 — 허용되지 않은 driver 상태 변경
