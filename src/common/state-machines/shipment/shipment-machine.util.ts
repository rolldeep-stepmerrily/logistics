import { createActor } from 'xstate';

import {
  shipmentMachine,
  type ShipmentEventInput,
  type ShipmentMachineContext,
  type ShipmentMachineState,
} from './shipment.machine';

interface ITransitionInput {
  currentStatus: ShipmentMachineState;
  context: ShipmentMachineContext;
  event: ShipmentEventInput;
}

interface ITransitionResult {
  nextStatus: ShipmentMachineState;
  context: ShipmentMachineContext;
  changed: boolean;
}

/**
 * 저장된 shipment 상태로부터 machine snapshot을 복원한다.
 * getPersistedSnapshot으로 재직렬화 가능한 형태로 반환.
 */
export const resolveShipmentSnapshot = (currentStatus: ShipmentMachineState, context: ShipmentMachineContext) => {
  const actor = createActor(shipmentMachine, { input: context });
  actor.start();
  return shipmentMachine.resolveState({
    value: currentStatus,
    context,
    // biome-ignore lint/suspicious/noExplicitAny: XState 5의 resolveState 타입이 union으로 좁혀지지 않아 명시적 우회
  } as any);
};

/**
 * 현재 상태 + 이벤트를 받아 다음 상태를 계산한다.
 *
 * 순수 함수처럼 사용 — DB 저장 / Kafka 발행은 호출자 책임.
 * transition이 거절되면 changed=false로 반환하며, 호출자가 AppException을 발생시킨다.
 */
export const runTransition = ({ currentStatus, context, event }: ITransitionInput): ITransitionResult => {
  const snapshot = resolveShipmentSnapshot(currentStatus, context);
  const actor = createActor(shipmentMachine, { snapshot, input: context });
  actor.start();
  actor.send(event);
  const next = actor.getSnapshot();
  actor.stop();

  const nextStatus = next.value as ShipmentMachineState;
  return {
    nextStatus,
    context: next.context,
    changed: nextStatus !== currentStatus,
  };
};
