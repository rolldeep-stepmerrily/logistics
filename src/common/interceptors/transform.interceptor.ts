import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';

import { map, Observable } from 'rxjs';

@Injectable()
export class TransformInterceptor implements NestInterceptor {
  // biome-ignore lint/correctness/noUnusedFunctionParameters: 사용
  // biome-ignore lint/suspicious/noExplicitAny: 사용
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(map((data) => data ?? {}));
  }
}
