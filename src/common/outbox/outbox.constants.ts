/**
 * Outbox 이벤트 타입 상수.
 *
 * outbox_events.eventType 컬럼 값. 컨슈머가 discriminate 하기 위한 키.
 */
export const OUTBOX_EVENT_TYPES = {
  SHIPMENT_TRANSITIONED: 'shipment.transitioned',
} as const;

/**
 * Kafka 토픽 매핑. 이벤트 타입별로 발행할 토픽 이름.
 */
export const OUTBOX_TOPIC_MAPPING: Record<string, string> = {
  [OUTBOX_EVENT_TYPES.SHIPMENT_TRANSITIONED]: 'shipment.events',
};
