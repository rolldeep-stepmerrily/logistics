import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { isDefined } from 'class-validator';
import type { Request } from 'express';

/**
 * 인증된 요청에서 user 객체 또는 특정 필드를 추출하는 파라미터 데코레이터
 */
export const User = createParamDecorator((data: string, ctx: ExecutionContext): unknown => {
  const request = ctx.switchToHttp().getRequest<Request & { user?: Record<string, unknown> }>();
  const user = request.user;

  return isDefined(data) ? user?.[data] : user;
});
