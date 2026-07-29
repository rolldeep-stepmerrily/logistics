import { AppException, GLOBAL_ERRORS } from '@@exceptions';
import { Logger } from '@nestjs/common';
import { isDefined } from 'class-validator';

const logger = new Logger('CatchDatabaseErrors');

type AnyMethod = (...args: unknown[]) => unknown;
type ClassConstructor = new (...args: never[]) => object;

/**
 * 클래스 데코레이터. 모든 인스턴스 메서드를 감싸 DB 관련 예외를 AppException 으로 정규화
 *
 * @returns {(target: ClassConstructor) => void} 클래스 데코레이터
 */
export const CatchDatabaseErrors = (): ((target: ClassConstructor) => void) => {
  return (target: ClassConstructor): void => {
    const prototype = target.prototype;
    const propertyNames = Object.getOwnPropertyNames(prototype);

    for (const propertyName of propertyNames) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, propertyName);

      if (!isDefined(descriptor) || typeof descriptor.value !== 'function') {
        continue;
      }

      const originalMethod = descriptor.value as AnyMethod;

      descriptor.value = async function (this: unknown, ...args: unknown[]): Promise<unknown> {
        try {
          return await originalMethod.apply(this, args);
        } catch (e) {
          if (e instanceof AppException) {
            throw e;
          }

          logger.error(e);

          throw new AppException(GLOBAL_ERRORS.DATABASE_ERROR);
        }
      };

      Object.defineProperty(prototype, propertyName, descriptor);
    }
  };
};
