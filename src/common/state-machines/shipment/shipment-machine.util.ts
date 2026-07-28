import { createActor } from 'xstate';

import { getShipmentInspector } from '../inspector';
import {
  type ShipmentDeliveryState,
  type ShipmentEventInput,
  type ShipmentMachineContext,
  type ShipmentMachineValue,
  type ShipmentPaymentState,
  shipmentMachine,
} from './shipment.machine';

interface ITransitionInput {
  currentDelivery: ShipmentDeliveryState;
  currentPayment: ShipmentPaymentState;
  context: ShipmentMachineContext;
  event: ShipmentEventInput;
}

export interface ITransitionResult {
  nextDelivery: ShipmentDeliveryState;
  nextPayment: ShipmentPaymentState;
  context: ShipmentMachineContext;
  deliveryChanged: boolean;
  paymentChanged: boolean;
  changed: boolean;
}

/**
 * Parallel machine 의 저장된 상태 (delivery + payment) 로부터 snapshot 을 복원한다.
 */
export const resolveShipmentSnapshot = (
  currentDelivery: ShipmentDeliveryState,
  currentPayment: ShipmentPaymentState,
  context: ShipmentMachineContext,
) => {
  const actor = createActor(shipmentMachine, { input: context });
  actor.start();
  return shipmentMachine.resolveState({
    value: { delivery: currentDelivery, payment: currentPayment },
    context,
    // biome-ignore lint/suspicious/noExplicitAny: XState 5의 resolveState 타입이 union으로 좁혀지지 않아 명시적 우회
  } as any);
};

/**
 * 현재 상태 + 이벤트를 받아 다음 상태를 계산한다.
 *
 * Parallel machine 이라 delivery / payment 두 서브머신 중 어느 쪽이 바뀌었는지 각각 체크한다.
 * 둘 다 안 바뀌면 changed=false → 호출자는 INVALID_TRANSITION 예외를 던진다.
 */
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

  const value = next.value as ShipmentMachineValue;
  const nextDelivery = value.delivery;
  const nextPayment = value.payment;

  const deliveryChanged = nextDelivery !== currentDelivery;
  const paymentChanged = nextPayment !== currentPayment;

  return {
    nextDelivery,
    nextPayment,
    context: next.context,
    deliveryChanged,
    paymentChanged,
    changed: deliveryChanged || paymentChanged,
  };
};
