import { Logger } from '@nestjs/common';
import { createSkyInspector } from '@statelyai/inspect';
import type { InspectionEvent, Observer } from 'xstate';

const logger = new Logger('StateMachineInspector');

let cachedInspect: ((ev: InspectionEvent) => void) | Observer<InspectionEvent> | undefined;
let initialized = false;

/**
 * XState Sky Inspector를 lazy-init 한다. dev 환경에서만 attach.
 *
 * production 에서는 undefined 반환 → createActor 가 inspect 옵션을 무시.
 * NODE_ENV 는 process.env 에서 직접 읽는다 (ConfigService 주입 없이 pure util 유지).
 */
export const getShipmentInspector = (): typeof cachedInspect => {
  if (initialized) {
    return cachedInspect;
  }

  initialized = true;

  const nodeEnv = process.env.NODE_ENV ?? 'development';
  if (nodeEnv === 'production') {
    return undefined;
  }

  if (process.env.XSTATE_INSPECT !== 'true') {
    return undefined;
  }

  try {
    const { inspect } = createSkyInspector({
      autoStart: true,
      onerror: (err) => logger.warn(`Sky inspector error: ${err.message}`),
    });
    cachedInspect = inspect;
    logger.log('Stately Sky inspector attached — check stdout for inspection URL');
  } catch (err) {
    logger.warn(`Failed to attach Stately Sky inspector: ${(err as Error).message}`);
    cachedInspect = undefined;
  }

  return cachedInspect;
};
