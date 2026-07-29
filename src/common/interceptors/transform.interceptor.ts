import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';

import { map, Observable } from 'rxjs';

@Injectable()
export class TransformInterceptor implements NestInterceptor {
  /**
   * 응답을 표준화 (null / undefined → 빈 객체) 하는 인터셉터
   *
   * @param {ExecutionContext} _context 실행 컨텍스트 (미사용)
   * @param {CallHandler} next 다음 핸들러
   * @returns {Observable<unknown>} 표준화된 응답 스트림
   */
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((data) => data ?? {}));
  }
}
