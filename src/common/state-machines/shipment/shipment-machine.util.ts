import { createActor } from 'xstate';

import { getShipmentInspector } from '../inspector';
import {
  type ShipmentDeliveryPhase,
  type ShipmentDeliveryState,
  type ShipmentDeliveryValue,
  type ShipmentEventInput,
  type ShipmentMachineContext,
  type ShipmentMachineValue,
  type ShipmentPaymentState,
  shipmentMachine,
} from './shipment.machine';

interface ITransitionInput {
  currentDelivery: ShipmentDeliveryState;
  currentPayment: ShipmentPaymentState;
  currentDeliveryPhase: ShipmentDeliveryPhase | null;
  context: ShipmentMachineContext;
  event: ShipmentEventInput;
}

export interface ITransitionResult {
  nextDelivery: ShipmentDeliveryState;
  nextPayment: ShipmentPaymentState;
  nextDeliveryPhase: ShipmentDeliveryPhase | null;
  context: ShipmentMachineContext;
  deliveryChanged: boolean;
  paymentChanged: boolean;
  phaseChanged: boolean;
  changed: boolean;
}

/**
 * DB 컬럼 (status, deliveryPhase) 을 XState value shape 으로 재조립. OUT_FOR_DELIVERY 만 compound state
 *
 * @param {ShipmentDeliveryState} delivery DB 의 status 컬럼 값
 * @param {ShipmentDeliveryPhase | null} phase DB 의 deliveryPhase 컬럼 값
 * @returns {ShipmentDeliveryValue} XState machine 의 delivery value
 */
const buildDeliveryValue = (
  delivery: ShipmentDeliveryState,
  phase: ShipmentDeliveryPhase | null,
): ShipmentDeliveryValue => {
  if (delivery === 'OUT_FOR_DELIVERY') {
    return { OUT_FOR_DELIVERY: phase ?? 'EN_ROUTE' };
  }

  return delivery;
};

/**
 * snapshot value 에서 (delivery, phase) 를 분리 추출
 *
 * @param {ShipmentDeliveryValue} value XState delivery value
 * @returns {{ delivery: ShipmentDeliveryState; phase: ShipmentDeliveryPhase | null }} 분리된 상태 조합
 */
const parseDeliveryValue = (
  value: ShipmentDeliveryValue,
): { delivery: ShipmentDeliveryState; phase: ShipmentDeliveryPhase | null } => {
  if (typeof value === 'string') {
    return { delivery: value, phase: null };
  }

  return { delivery: 'OUT_FOR_DELIVERY', phase: value.OUT_FOR_DELIVERY };
};

/**
 * Parallel + compound machine 의 저장된 상태로부터 snapshot 을 복원
 *
 * @param {ShipmentDeliveryState} currentDelivery 현재 delivery 상태
 * @param {ShipmentPaymentState} currentPayment 현재 payment 상태
 * @param {ShipmentDeliveryPhase | null} currentDeliveryPhase 현재 delivery phase
 * @param {ShipmentMachineContext} context 머신 컨텍스트
 * @returns {ReturnType<typeof shipmentMachine.resolveState>} 복원된 snapshot
 */
export const resolveShipmentSnapshot = (
  currentDelivery: ShipmentDeliveryState,
  currentPayment: ShipmentPaymentState,
  currentDeliveryPhase: ShipmentDeliveryPhase | null,
  context: ShipmentMachineContext,
): ReturnType<typeof shipmentMachine.resolveState> => {
  const actor = createActor(shipmentMachine, { input: context });
  actor.start();

  return shipmentMachine.resolveState({
    value: {
      delivery: buildDeliveryValue(currentDelivery, currentDeliveryPhase),
      payment: currentPayment,
    },
    context,
    // biome-ignore lint/suspicious/noExplicitAny: XState 5 의 resolveState 타입이 parallel value 유니온으로 좁혀지지 않아 명시적 우회
  } as any);
};

/**
 * 현재 상태 + 이벤트를 받아 다음 상태를 계산. 세 축 (delivery / payment / phase) 중 어느 하나라도 바뀌면 changed=true
 *
 * @param {ITransitionInput} input 전이 입력값
 * @returns {ITransitionResult} 전이 결과
 */
export const runTransition = ({
  currentDelivery,
  currentPayment,
  currentDeliveryPhase,
  context,
  event,
}: ITransitionInput): ITransitionResult => {
  const snapshot = resolveShipmentSnapshot(currentDelivery, currentPayment, currentDeliveryPhase, context);
  const inspect = getShipmentInspector();
  const actor = createActor(shipmentMachine, { snapshot, input: context, inspect });
  actor.start();
  actor.send(event);
  const next = actor.getSnapshot();
  actor.stop();

  const value = next.value as ShipmentMachineValue;
  const { delivery: nextDelivery, phase: nextDeliveryPhase } = parseDeliveryValue(value.delivery);
  const nextPayment = value.payment;

  const deliveryChanged = nextDelivery !== currentDelivery;
  const paymentChanged = nextPayment !== currentPayment;
  const phaseChanged = nextDeliveryPhase !== currentDeliveryPhase;

  return {
    nextDelivery,
    nextPayment,
    nextDeliveryPhase,
    context: next.context,
    deliveryChanged,
    paymentChanged,
    phaseChanged,
    changed: deliveryChanged || paymentChanged || phaseChanged,
  };
};
