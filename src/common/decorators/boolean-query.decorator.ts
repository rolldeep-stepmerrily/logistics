import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/**
 * boolean 문자열 쿼리 파라미터 (true/false/1/0) 를 boolean 으로 변환하는 파라미터 데코레이터
 */
export const BooleanQuery = createParamDecorator((data: string, ctx: ExecutionContext): boolean | undefined => {
  const request = ctx.switchToHttp().getRequest<Request>();

  const value = request.query[data];

  if (value === 'true' || value === '1') {
    return true;
  }

  if (value === 'false' || value === '0') {
    return false;
  }

  return undefined;
});
